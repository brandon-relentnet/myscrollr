# yahoo-probe

Read-only probe for the Yahoo Fantasy Sports v2 API. Helpful when you need to
see exactly what a Yahoo endpoint returns (without going through the channel
sync loop or desktop UI).

Never writes to Yahoo, never writes to the Scrollr database. Nothing to revert.

## Setup

Collect three env vars from production:

- `YAHOO_CLIENT_ID` / `YAHOO_CLIENT_SECRET` — from `scrollr-secrets` in the
  `scrollr` namespace.
- `YAHOO_REFRESH_TOKEN` — from `yahoo_users.refresh_token` for the GUID you
  want to probe. Copy once, scrub when done.

Example:

```sh
export YAHOO_CLIENT_ID=$(kubectl get secret -n scrollr scrollr-secrets \
    -o jsonpath='{.data.YAHOO_CLIENT_ID}' | base64 -d)

export YAHOO_CLIENT_SECRET=$(kubectl get secret -n scrollr scrollr-secrets \
    -o jsonpath='{.data.YAHOO_CLIENT_SECRET}' | base64 -d)

# Then fetch the refresh token via a throwaway psql pod (see
# scripts/yahoo-probe/fetch-refresh-token.sh for the canned command).
export YAHOO_REFRESH_TOKEN=...
```

## Usage

```sh
go run . <url-path> [outfile]
```

The path is everything after `/fantasy/v2/`. Examples:

```sh
# League settings (stat categories + modifiers)
go run . league/469.l.35099/settings out/01-settings.xml

# Roster with weekly stats
go run . team/469.l.35099.t.6/roster\;week=4/players/stats\;type=week\;week=4 \
    out/02-roster-weekly.xml

# Sport-level stat catalog (every possible MLB stat)
go run . game/mlb/stat_categories out/03-mlb-stats.xml
```

Responses are pretty-printed with `encoding/xml` indentation and written to
the outfile (default `out.xml`).

## Running the full probe suite

See `probe-suite.sh` for the canonical set of paths to cover when
investigating a league.

## Cleanup

After a probing session:

```sh
unset YAHOO_REFRESH_TOKEN YAHOO_CLIENT_ID YAHOO_CLIENT_SECRET
rm -rf out/
```
