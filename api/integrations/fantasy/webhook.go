package fantasy

import (
	"context"
	"strings"
)

// routeYahooByGuid resolves a yahoo_leagues record's guid to a logto_sub.
func (f *Integration) routeYahooByGuid(ctx context.Context, record map[string]interface{}, payload []byte) {
	guid, ok := record["guid"].(string)
	if !ok || guid == "" {
		return
	}
	var logtoSub string
	err := f.db.QueryRow(ctx, "SELECT logto_sub FROM yahoo_users WHERE guid = $1", guid).Scan(&logtoSub)
	if err != nil {
		return // User not found or DB error — skip silently
	}
	f.sendToUser(logtoSub, payload)
}

// routeYahooByLeagueKey resolves a yahoo_standings record's league_key to a logto_sub.
func (f *Integration) routeYahooByLeagueKey(ctx context.Context, record map[string]interface{}, payload []byte) {
	leagueKey, ok := record["league_key"].(string)
	if !ok || leagueKey == "" {
		return
	}
	var logtoSub string
	err := f.db.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	f.sendToUser(logtoSub, payload)
}

// routeYahooByTeamKey resolves a yahoo_matchups/yahoo_rosters record's team_key to a logto_sub.
// Team keys follow the format "nfl.l.{league_id}.t.{team_id}" — we extract the league portion.
func (f *Integration) routeYahooByTeamKey(ctx context.Context, record map[string]interface{}, payload []byte) {
	teamKey, ok := record["team_key"].(string)
	if !ok || teamKey == "" {
		return
	}

	// Extract league_key from team_key: "nfl.l.12345.t.1" → "nfl.l.12345"
	parts := strings.SplitN(teamKey, ".t.", 2)
	if len(parts) == 0 {
		return
	}
	leagueKey := parts[0]

	var logtoSub string
	err := f.db.QueryRow(ctx, `
		SELECT yu.logto_sub FROM yahoo_leagues yl
		JOIN yahoo_users yu ON yl.guid = yu.guid
		WHERE yl.league_key = $1
	`, leagueKey).Scan(&logtoSub)
	if err != nil {
		return
	}
	f.sendToUser(logtoSub, payload)
}
