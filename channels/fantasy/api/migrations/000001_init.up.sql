-- Yahoo Fantasy tables: users, leagues, standings, rosters, matchups, user_leagues
CREATE TABLE IF NOT EXISTS yahoo_users (
    guid VARCHAR(100) PRIMARY KEY,
    logto_sub VARCHAR(255) UNIQUE,
    refresh_token TEXT NOT NULL,
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_leagues (
    league_key VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    game_code VARCHAR(10) NOT NULL,
    season VARCHAR(10) NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_standings (
    league_key VARCHAR(50) PRIMARY KEY REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_rosters (
    team_key VARCHAR(50) PRIMARY KEY,
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS yahoo_matchups (
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    week SMALLINT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (league_key, week)
);

CREATE TABLE IF NOT EXISTS yahoo_user_leagues (
    guid VARCHAR(100) NOT NULL REFERENCES yahoo_users(guid) ON DELETE CASCADE,
    league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
    team_key VARCHAR(50),
    team_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guid, league_key)
);

CREATE INDEX IF NOT EXISTS idx_yahoo_user_leagues_guid ON yahoo_user_leagues(guid);
CREATE INDEX IF NOT EXISTS idx_yahoo_user_leagues_league_key ON yahoo_user_leagues(league_key);
CREATE INDEX IF NOT EXISTS idx_yahoo_rosters_league_key ON yahoo_rosters(league_key);
CREATE INDEX IF NOT EXISTS idx_yahoo_matchups_league_key_week ON yahoo_matchups(league_key, week DESC);
