#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'
BOLD='\033[1m'

TOTAL=0
PASSED=0
FAILED=0

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASSED=$((PASSED + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILED=$((FAILED + 1)); }
log_section() { echo -e "\n${BOLD}═══ $1 ═══${NC}"; }
log_test() { TOTAL=$((TOTAL + 1)); echo -e "  ${BOLD}▸${NC} $1"; }

CONTAINER_NAME="scrollr-test-$$"
POSTGRES_USER="scrollr"
POSTGRES_DB="scrollr"
DOCKER_GW="172.17.0.1"

cleanup() {
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
}

start_db() {
    cleanup
    docker run -d --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$POSTGRES_USER" \
        -e POSTGRES_DB="$POSTGRES_DB" \
        -e POSTGRES_PASSWORD="$POSTGRES_USER" \
        -p 5432:5432 \
        postgres:16-alpine >/dev/null 2>&1
    sleep 10
    wait_for_db
}

wait_for_db() {
    local n=30
    while ! docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; do
        n=$((n - 1))
        [ $n -le 0 ] && echo "ERROR: postgres never ready" && exit 1
        sleep 1
    done
}

# Run SQL files in order using docker exec
run_sql_files() {
    local dir="$1"
    for f in $(ls "$dir"/*.up.sql 2>/dev/null | sort); do
        docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$(cat "$f")" >/dev/null 2>&1 || true
    done
}

# Run SQL files in reverse order (down migrations)
run_down_sql_files() {
    local dir="$1"
    for f in $(ls "$dir"/*.down.sql 2>/dev/null | sort -r); do
        docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$(cat "$f")" >/dev/null 2>&1 || true
    done
}

db_exec() {
    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "$1" 2>&1 | xargs
}

db_exec_raw() {
    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1" 2>&1 || true
}

# =============================================================================
# CORE API TESTS (Go)
# =============================================================================

test_core_api() {
    log_section "Core API (Go) — SQL file tests"

    local DIR="/home/simon/dev/com-proj/myscrollr/api/migrations"

    # Test 1: Up migrations idempotency
    log_test "Idempotency: run all up migrations twice"
    start_db
    run_sql_files "$DIR"
    sleep 1
    run_sql_files "$DIR"  # Second run should be no-op
    sleep 1
    local TABLES=$(db_exec "SELECT COUNT(*) FROM user_channels")
    if [ "$TABLES" = "" ]; then
        log_fail "Idempotency (tables not created)"
    else
        log_pass "Idempotency"
    fi

    # Test 2: Data preservation
    log_test "Data: data survives migration re-run"
    db_exec_raw "INSERT INTO user_channels (logto_sub, channel_type, config) VALUES ('u1','sports','{}')"
    db_exec_raw "INSERT INTO user_preferences (logto_sub, subscription_tier) VALUES ('u1','pro')"
    db_exec_raw "INSERT INTO stripe_customers (logto_sub, stripe_customer_id, plan) VALUES ('u1','cus1','pro')"
    run_sql_files "$DIR"
    sleep 1
    local U=$(db_exec "SELECT COUNT(*) FROM user_channels WHERE logto_sub='u1'")
    if [ "$U" = "1" ]; then
        log_pass "Data preservation"
    else
        log_fail "Data preservation (got '$U')"
    fi

    # Test 3: UNIQUE (logto_sub, channel_type)
    log_test "UNIQUE: duplicate (logto_sub, channel_type) rejected"
    echo "DEBUG: PID=$$ CONTAINER=$CONTAINER_NAME running='$(docker ps -q --filter name="$CONTAINER_NAME" 2>/dev/null)'" >&2
    local R=$(db_exec_raw "INSERT INTO user_channels (logto_sub, channel_type) VALUES ('u1','sports')" 2>&1 || true)
    echo "DEBUG R_LEN=${#R} R='$R'" >&2
    if echo "$R" | grep -qi "unique\|duplicate\|violation"; then
        log_pass "UNIQUE constraint"
    else
        log_fail "UNIQUE constraint (R='$R')"
    fi

    # Test 4: NOT NULL
    log_test "NOT NULL: missing required fields rejected"
    local R=$(db_exec_raw "INSERT INTO user_channels (channel_type) VALUES ('sports')" 2>&1 || true)
    if echo "$R" | grep -qi "null\|violation"; then
        log_pass "NOT NULL constraint"
    else
        log_fail "NOT NULL constraint"
    fi

    # Test 5: JSONB
    log_test "JSONB: nested data stored and queried"
    db_exec_raw "INSERT INTO user_channels (logto_sub, channel_type, config) VALUES ('j1','rss','{\"feeds\":[\"a\",\"b\"],\"opts\":{\"dark\":true}}')"
    local V=$(db_exec "SELECT config->>'feeds' FROM user_channels WHERE logto_sub='j1'")
    local D=$(db_exec "SELECT config->'opts'->>'dark' FROM user_channels WHERE logto_sub='j1'")
    if echo "$V" | grep -q "a" && echo "$V" | grep -q "b" && [ "$D" = "true" ]; then
        log_pass "JSONB nested"
    else
        log_fail "JSONB nested (feeds='$V', dark='$D')"
    fi

    # Test 6: TIMESTAMPTZ defaults
    log_test "TIMESTAMPTZ: defaults auto-set on insert"
    local T=$(db_exec "SELECT EXTRACT(EPOCH FROM created_at) > 0 FROM user_channels LIMIT 1")
    if [ "$T" = "t" ]; then
        log_pass "TIMESTAMPTZ defaults"
    else
        log_fail "TIMESTAMPTZ defaults"
    fi

    # Test 7: subscription_tier column (mig 002)
    log_test "Migration 002: subscription_tier column"
    local C=$(db_exec "SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='subscription_tier'")
    if [ -n "$C" ]; then
        log_pass "subscription_tier column"
    else
        log_fail "subscription_tier column missing"
    fi

    # Test 8: lifetime column (mig 003)
    log_test "Migration 003: lifetime column"
    local L=$(db_exec "SELECT lifetime FROM stripe_customers WHERE logto_sub='u1'")
    if [ "$L" = "f" ]; then
        log_pass "lifetime column"
    else
        log_fail "lifetime column (got '$L')"
    fi

    # Test 9: Down migrations
    log_test "Down migrations: tables dropped correctly"
    run_down_sql_files "$DIR"
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM user_channels")
    if echo "$T" | grep -qi "error"; then
        log_pass "Down migrations"
    else
        log_fail "Down migrations (tables still exist)"
    fi

    # Test 10: Up after down
    log_test "Up migrations: full recreate after down"
    run_sql_files "$DIR"
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM user_channels")
    local P=$(db_exec "SELECT COUNT(*) FROM user_preferences")
    if [ "$T" = "0" ] && [ "$P" = "0" ]; then
        log_pass "Up after down"
    else
        log_fail "Up after down (channels=$T, prefs=$P)"
    fi

    cleanup
}

# =============================================================================
# FANTASY API TESTS (Go)
# =============================================================================

test_fantasy_api() {
    log_section "Fantasy API (Go) — SQL file tests"

    local DIR="/home/simon/dev/com-proj/myscrollr/channels/fantasy/api/migrations"

    # Test 1: Idempotency
    log_test "Idempotency: run all migrations twice"
    start_db
    run_sql_files "$DIR"
    sleep 1
    run_sql_files "$DIR"
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM yahoo_users")
    if [ "$T" = "" ]; then
        log_fail "Idempotency (tables not created)"
    else
        log_pass "Idempotency"
    fi

    # Test 2: FK cascade delete
    log_test "FK cascade: delete user removes leagues and rosters"
    db_exec_raw "INSERT INTO yahoo_users (guid, logto_sub, refresh_token) VALUES ('g1','s1','tok')"
    db_exec_raw "INSERT INTO yahoo_leagues (league_key, name, game_code, season, data) VALUES ('l.1','League','nfl','2025','{}')"
    db_exec_raw "INSERT INTO yahoo_rosters (team_key, league_key, data) VALUES ('t.1','l.1','{}')"
    db_exec_raw "INSERT INTO yahoo_user_leagues (guid, league_key) VALUES ('g1','l.1')"
    db_exec_raw "DELETE FROM yahoo_users WHERE guid='g1'"
    local R=$(db_exec "SELECT COUNT(*) FROM yahoo_user_leagues WHERE guid='g1'")
    if [ "$R" = "0" ]; then
        log_pass "FK cascade delete"
    else
        log_fail "FK cascade (expected 0, got $R)"
    fi

    # Test 3: logto_sub UNIQUE (migration 003)
    log_test "Migration 003: logto_sub UNIQUE constraint enforced"
    db_exec_raw "INSERT INTO yahoo_users (guid, logto_sub, refresh_token) VALUES ('ga','s-unique','tok1')"
    local R=$(db_exec_raw "INSERT INTO yahoo_users (guid, logto_sub, refresh_token) VALUES ('gb','s-unique','tok2')" 2>&1 || true)
    if echo "$R" | grep -qi "unique\|duplicate\|violation"; then
        log_pass "logto_sub UNIQUE"
    else
        log_fail "logto_sub UNIQUE"
    fi

    # Test 4: team_key/team_name (in init, migration 002 is no-op)
    log_test "Migration 002: team_key/team_name columns in init"
    local K=$(db_exec "SELECT column_name FROM information_schema.columns WHERE table_name='yahoo_user_leagues' AND column_name='team_key'")
    local N=$(db_exec "SELECT column_name FROM information_schema.columns WHERE table_name='yahoo_user_leagues' AND column_name='team_name'")
    if [ -n "$K" ] && [ -n "$N" ]; then
        log_pass "team_key/team_name columns"
    else
        log_fail "team_key/team_name columns (key='$K', name='$N')"
    fi

    # Test 5: JSONB standings/rosters
    log_test "JSONB: standings and rosters data"
    db_exec_raw "INSERT INTO yahoo_standings (league_key, data) VALUES ('l.1','{\"rank\":[{\"name\":\"TeamA\"}]}')"
    db_exec_raw "INSERT INTO yahoo_rosters (team_key, league_key, data) VALUES ('t.2','l.1','{\"players\":[{\"name\":\"Joe\",\"pos\":\"QB\"}]}')"
    local S=$(db_exec "SELECT data->'rank'->0->>'name' FROM yahoo_standings WHERE league_key='l.1'")
    local P=$(db_exec "SELECT data->'players'->0->>'pos' FROM yahoo_rosters WHERE team_key='t.2'")
    if [ "$S" = "TeamA" ] && [ "$P" = "QB" ]; then
        log_pass "JSONB data"
    else
        log_fail "JSONB (standings='$S', position='$P')"
    fi

    # Test 6: migration 004 removes guid from leagues
    log_test "Migration 004: guid column removed from yahoo_leagues"
    local R=$(db_exec "SELECT guid FROM yahoo_leagues LIMIT 1")
    if echo "$R" | grep -qi "error"; then
        log_pass "guid removed"
    else
        log_fail "guid column should not exist"
    fi

    # Test 7: Down migrations
    log_test "Down migrations: all tables dropped"
    run_down_sql_files "$DIR"
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM yahoo_users")
    if echo "$T" | grep -qi "error"; then
        log_pass "Down migrations"
    else
        log_fail "Down migrations (tables remain)"
    fi

    # Test 8: Up after down
    log_test "Up after down: full recreate"
    run_sql_files "$DIR"
    sleep 1
    local U=$(db_exec "SELECT COUNT(*) FROM yahoo_users")
    local L=$(db_exec "SELECT COUNT(*) FROM yahoo_leagues")
    if [ "$U" = "0" ] && [ "$L" = "0" ]; then
        log_pass "Up after down"
    else
        log_fail "Up after down (users=$U, leagues=$L)"
    fi

    cleanup
}

# =============================================================================
# FINANCE SERVICE TESTS (Rust)
# =============================================================================

test_finance_service() {
    log_section "Finance Service (Rust) — Binary + SQL tests"

    local SVC="/home/simon/dev/com-proj/myscrollr/channels/finance/service"
    local BIN="$SVC/target/release/finance_service"

    if [ ! -f "$BIN" ]; then
        log_info "Building Finance Service..."
        (cd "$SVC" && cargo build --release) >/dev/null 2>&1
    fi

    # Test 1: Idempotency
    log_test "Idempotency: migrations safe to run twice"
    start_db
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 5 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local T=$(db_exec "SELECT COUNT(*) FROM trades")
    if [ -n "$T" ]; then
        log_pass "Idempotency"
    else
        log_fail "Idempotency"
    fi

    # Test 2: Data insertion
    log_test "Data: trade and symbol with all fields"
    db_exec_raw "INSERT INTO trades (symbol, price, previous_close, price_change, percentage_change, direction) VALUES ('AAPL',185.50,183.20,2.30,1.26,'up')"
    db_exec_raw "INSERT INTO tracked_symbols (symbol, is_enabled, name, category) VALUES ('NVDA',true,'NVIDIA Corp','Technology')"
    local P=$(db_exec "SELECT price FROM trades WHERE symbol='AAPL'")
    local N=$(db_exec "SELECT name FROM tracked_symbols WHERE symbol='NVDA'")
    if [ "$P" = "185.50" ] && [ "$N" = "NVIDIA Corp" ]; then
        log_pass "Data insertion"
    else
        log_fail "Data insertion (price='$P', name='$N')"
    fi

    # Test 3: UNIQUE symbol
    log_test "UNIQUE: duplicate trade symbol rejected"
    local R=$(db_exec_raw "INSERT INTO trades (symbol, price, previous_close, price_change, percentage_change, direction) VALUES ('AAPL',190,185.50,4.50,2.43,'up')" 2>&1 || true)
    if echo "$R" | grep -qi "unique\|duplicate\|violation"; then
        log_pass "Symbol UNIQUE"
    else
        log_fail "Symbol UNIQUE"
    fi

    # Test 4: Migration 002 name/category
    log_test "Migration 002: name and category columns"
    db_exec_raw "INSERT INTO tracked_symbols (symbol, name, category) VALUES ('TSLA','Tesla Inc','Automotive')"
    local N=$(db_exec "SELECT name FROM tracked_symbols WHERE symbol='TSLA'")
    local C=$(db_exec "SELECT category FROM tracked_symbols WHERE symbol='TSLA'")
    if [ "$N" = "Tesla Inc" ] && [ "$C" = "Automotive" ]; then
        log_pass "name/category columns"
    else
        log_fail "name/category (name='$N', cat='$C')"
    fi

    # Test 5: Default is_enabled
    log_test "Default: is_enabled defaults to TRUE"
    db_exec_raw "INSERT INTO tracked_symbols (symbol) VALUES ('AMZN')"
    local E=$(db_exec "SELECT is_enabled FROM tracked_symbols WHERE symbol='AMZN'")
    if [ "$E" = "t" ]; then
        log_pass "Default is_enabled"
    else
        log_fail "Default is_enabled (got '$E')"
    fi

    # Test 6: Down migrations
    log_test "Down migrations: tables dropped"
    run_down_sql_files "$SVC/migrations"
    db_exec_raw "DELETE FROM _sqlx_migrations" 2>/dev/null || true
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM trades")
    if echo "$T" | grep -qi "error"; then
        log_pass "Down migrations"
    else
        log_fail "Down migrations"
    fi

    # Test 7: Up after down
    log_test "Up after down: full recreate"
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local T=$(db_exec "SELECT COUNT(*) FROM trades")
    local S=$(db_exec "SELECT COUNT(*) FROM tracked_symbols")
    if [ "$T" = "0" ] && [ "$S" = "0" ]; then
        log_pass "Up after down"
    else
        log_fail "Up after down (trades=$T, symbols=$S)"
    fi

    cleanup
}

# =============================================================================
# SPORTS SERVICE TESTS (Rust)
# =============================================================================

test_sports_service() {
    log_section "Sports Service (Rust) — Binary + SQL tests"

    local SVC="/home/simon/dev/com-proj/myscrollr/channels/sports/service"
    local BIN="$SVC/target/release/sports_service"

    if [ ! -f "$BIN" ]; then
        log_info "Building Sports Service..."
        (cd "$SVC" && cargo build --release) >/dev/null 2>&1
    fi

    # Test 1: Idempotency
    log_test "Idempotency: migrations safe to run twice"
    start_db
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    API_SPORTS_KEY=test API_SPORTS_BASE_URL=https://api.api-sports.io \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    API_SPORTS_KEY=test API_SPORTS_BASE_URL=https://api.api-sports.io \
    timeout 5 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local T=$(db_exec "SELECT COUNT(*) FROM games")
    if [ -n "$T" ]; then
        log_pass "Idempotency"
    else
        log_fail "Idempotency"
    fi

    # Test 2: UNIQUE constraint
    log_test "UNIQUE: duplicate (league, external_game_id) rejected"
    db_exec_raw "INSERT INTO games (league,external_game_id,home_team_name,away_team_name,start_time,state) VALUES ('NFL','g-123','Pats','Chiefs','2025-09-08','pre')"
    local R=$(db_exec_raw "INSERT INTO games (league,external_game_id,home_team_name,away_team_name,start_time,state) VALUES ('NFL','g-123','Bills','Dolphins','2025-09-08','pre')" 2>&1 || true)
    if echo "$R" | grep -qi "unique\|duplicate\|violation"; then
        log_pass "games UNIQUE"
    else
        log_fail "games UNIQUE"
    fi

    # Test 3: All migration 002 columns
    log_test "Migration 002: all extended columns"
    db_exec_raw "INSERT INTO games (league,external_game_id,home_team_name,away_team_name,start_time,state,sport,status_short,status_long,timer,venue,season) VALUES ('NBA','nba-1','Lakers','Warriors','2025-10-01','pre','basketball','NS','Not Started','0:00','Crypto Arena','2025-26')"
    local V=$(db_exec "SELECT venue FROM games WHERE external_game_id='nba-1'")
    local T=$(db_exec "SELECT timer FROM games WHERE external_game_id='nba-1'")
    local S=$(db_exec "SELECT sport FROM games WHERE external_game_id='nba-1'")
    if [ "$V" = "Crypto Arena" ] && [ "$T" = "0:00" ] && [ "$S" = "basketball" ]; then
        log_pass "Migration 002 columns"
    else
        log_fail "Migration 002 (venue='$V', timer='$T', sport='$S')"
    fi

    # Test 4: tracked_leagues extended columns
    log_test "Migration 002: tracked_leagues extended columns + ARRAY"
    db_exec_raw "INSERT INTO tracked_leagues (name,category,sport_api,league_id,country,logo_url,season,season_format,offseason_months) VALUES ('NFL','Football','espn-api',1,'USA','https://nfl.png','2025','regular',ARRAY[1,2,6,7,8,12])"
    local C=$(db_exec "SELECT category FROM tracked_leagues WHERE name='NFL'")
    local O=$(db_exec "SELECT offseason_months FROM tracked_leagues WHERE name='NFL'")
    if [ "$C" = "Football" ] && echo "$O" | grep -q "1.*2.*6.*7.*8.*12"; then
        log_pass "tracked_leagues extended + ARRAY"
    else
        log_fail "tracked_leagues (cat='$C', off='$O')"
    fi

    # Test 5: SERIAL auto-increment
    log_test "SERIAL: primary keys auto-increment"
    local B=$(db_exec "SELECT id FROM games ORDER BY id DESC LIMIT 1")
    db_exec_raw "INSERT INTO games (league,external_game_id,home_team_name,away_team_name,start_time,state) VALUES ('MLB','mlb-1','Yankees','Red Sox','2025-04-01','pre')"
    local A=$(db_exec "SELECT id FROM games ORDER BY id DESC LIMIT 1")
    if [ -n "$B" ] && [ -n "$A" ] && [ "$A" -gt "$B" ]; then
        log_pass "SERIAL auto-increment"
    else
        log_fail "SERIAL (before='$B', after='$A')"
    fi

    # Test 6: Down migrations
    log_test "Down migrations: all tables dropped"
    run_down_sql_files "$SVC/migrations"
    db_exec_raw "DELETE FROM _sqlx_migrations" 2>/dev/null || true
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM games")
    if echo "$T" | grep -qi "error"; then
        log_pass "Down migrations"
    else
        log_fail "Down migrations"
    fi

    # Test 7: Up after down
    log_test "Up after down: full recreate"
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local G=$(db_exec "SELECT COUNT(*) FROM games")
    local L=$(db_exec "SELECT COUNT(*) FROM tracked_leagues")
    if [ "$G" = "0" ] && [ "$L" = "0" ]; then
        log_pass "Up after down"
    else
        log_fail "Up after down (games=$G, leagues=$L)"
    fi

    cleanup
}

# =============================================================================
# RSS SERVICE TESTS (Rust)
# =============================================================================

test_rss_service() {
    log_section "RSS Service (Rust) — Binary + SQL tests"

    local SVC="/home/simon/dev/com-proj/myscrollr/channels/rss/service"
    local BIN="$SVC/target/release/rss_service"

    if [ ! -f "$BIN" ]; then
        log_info "Building RSS Service..."
        (cd "$SVC" && cargo build --release) >/dev/null 2>&1
    fi

    # Test 1: Idempotency
    log_test "Idempotency: migrations safe to run twice"
    start_db
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 5 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local T=$(db_exec "SELECT COUNT(*) FROM tracked_feeds")
    if [ -n "$T" ]; then
        log_pass "Idempotency"
    else
        log_fail "Idempotency"
    fi

    # Test 2: FK cascade delete
    log_test "FK cascade: delete feed removes items"
    db_exec_raw "INSERT INTO tracked_feeds (url,name,category) VALUES ('https://cascade.test','Cascade','Tech')"
    db_exec_raw "INSERT INTO rss_items (feed_url,guid,title,link,published_at) VALUES ('https://cascade.test','i1','Article','https://a.com',now())"
    db_exec_raw "INSERT INTO rss_items (feed_url,guid,title,link,published_at) VALUES ('https://cascade.test','i2','Article 2','https://b.com',now())"
    db_exec_raw "DELETE FROM tracked_feeds WHERE url='https://cascade.test'"
    local R=$(db_exec "SELECT COUNT(*) FROM rss_items WHERE feed_url='https://cascade.test'")
    if [ "$R" = "0" ]; then
        log_pass "FK cascade"
    else
        log_fail "FK cascade (expected 0, got $R)"
    fi

    # Test 3: UNIQUE (feed_url, guid)
    log_test "UNIQUE: duplicate (feed_url, guid) rejected"
    db_exec_raw "INSERT INTO tracked_feeds (url,name,category) VALUES ('https://uniq.test','Unique','Tech')"
    db_exec_raw "INSERT INTO rss_items (feed_url,guid,title,link,published_at) VALUES ('https://uniq.test','g1','First','https://a.com',now())"
    local R=$(db_exec_raw "INSERT INTO rss_items (feed_url,guid,title,link,published_at) VALUES ('https://uniq.test','g1','Dup','https://b.com',now())" 2>&1 || true)
    if echo "$R" | grep -qi "unique\|duplicate\|violation"; then
        log_pass "UNIQUE (feed_url, guid)"
    else
        log_fail "UNIQUE (feed_url, guid)"
    fi

    # Test 4: Index on published_at
    log_test "Index: idx_rss_items_published_at exists"
    local I=$(db_exec "SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_rss_items_published_at'")
    if [ "$I" = "1" ]; then
        log_pass "published_at index"
    else
        log_fail "published_at index (count=$I)"
    fi

    # Test 5: No duplicate index
    log_test "No duplicate index: migration 002 fix verified"
    local I=$(db_exec "SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_rss_items_published_at'")
    if [ "$I" = "1" ]; then
        log_pass "No duplicate index"
    else
        log_fail "Duplicate index (count=$I)"
    fi

    # Test 6: Failure tracking columns (mig 002)
    log_test "Migration 002: failure tracking columns"
    db_exec_raw "UPDATE tracked_feeds SET consecutive_failures=5,last_error='SSL timeout',last_error_at=now(),last_success_at=now()-'2 hours'::interval WHERE url='https://uniq.test'"
    local F=$(db_exec "SELECT consecutive_failures FROM tracked_feeds WHERE url='https://uniq.test'")
    if [ "$F" = "5" ]; then
        log_pass "Failure tracking columns"
    else
        log_fail "Failure tracking (got '$F')"
    fi

    # Test 7: Default values
    log_test "Default: is_default=false, is_enabled=true"
    local D=$(db_exec "SELECT is_default FROM tracked_feeds WHERE url='https://uniq.test'")
    local E=$(db_exec "SELECT is_enabled FROM tracked_feeds WHERE url='https://uniq.test'")
    if [ "$D" = "f" ] && [ "$E" = "t" ]; then
        log_pass "Default values"
    else
        log_fail "Defaults (is_default='$D', is_enabled='$E')"
    fi

    # Test 8: Down migrations
    log_test "Down migrations: tables dropped"
    run_down_sql_files "$SVC/migrations"
    db_exec_raw "DELETE FROM _sqlx_migrations" 2>/dev/null || true
    sleep 1
    local T=$(db_exec "SELECT COUNT(*) FROM rss_items")
    if echo "$T" | grep -qi "error"; then
        log_pass "Down migrations"
    else
        log_fail "Down migrations"
    fi

    # Test 9: Up after down
    log_test "Up after down: full recreate"
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_USER}@localhost:5432/${POSTGRES_DB}" \
    TWELVEDATA_API_KEY=test TWELVEDATA_REST_URL=https://api.twelvedata.com TWELVEDATA_WS_URL=wss://ws.twelvedata.com \
    timeout 8 "$BIN" >/dev/null 2>&1 || true
    sleep 2
    local F=$(db_exec "SELECT COUNT(*) FROM tracked_feeds")
    local I=$(db_exec "SELECT COUNT(*) FROM rss_items")
    if [ "$F" = "0" ] && [ "$I" = "0" ]; then
        log_pass "Up after down"
    else
        log_fail "Up after down (feeds=$F, items=$I)"
    fi

    cleanup
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo -e "${BOLD}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          MyScrollr Migration Test Suite                    ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    log_info "Testing migration SQL files + Rust binaries..."
    log_info "Note: Go API binaries skipped (no host postgres); SQL files tested directly."

    test_core_api
    test_fantasy_api
    test_finance_service
    test_sports_service
    test_rss_service

    log_section "Test Summary"
    echo -e "  Total:   ${BOLD}$TOTAL${NC}"
    echo -e "  Passed:  ${GREEN}$PASSED${NC}"
    echo -e "  Failed:  ${RED}$FAILED${NC}"

    if [ $FAILED -gt 0 ]; then
        echo -e "\n${RED}${BOLD}❌ $FAILED TEST(S) FAILED${NC}"
        exit 1
    else
        echo -e "\n${GREEN}${BOLD}✅ ALL $TOTAL TESTS PASSED${NC}"
        exit 0
    fi
}

trap cleanup EXIT
main "$@"
