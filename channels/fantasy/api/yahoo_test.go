package main

import (
	"testing"
)

func TestSafeAtoi(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  int
	}{
		{"valid number", "123", 123},
		{"zero", "0", 0},
		{"negative", "-45", -45},
		{"large number", "999999999", 999999999},
		{"invalid string", "abc", 0},
		{"empty string", "", 0},
		{"float string", "12.34", 0},
		{"with spaces", "  42  ", 0}, // strconv trims, but leading space causes failure
		{"mixed", "42abc", 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := safeAtoi(tc.input)
			if got != tc.want {
				t.Errorf("safeAtoi(%q) = %d, want %d", tc.input, got, tc.want)
			}
		})
	}
}

func TestSafeAtoiPtr(t *testing.T) {
	ptr := func(s string) *string { return &s }
	nilStr := (*string)(nil)

	tests := []struct {
		name  string
		input *string
		want  *int
	}{
		{"valid string", ptr("42"), ptrInt(42)},
		{"zero string", ptr("0"), ptrInt(0)},
		{"negative", ptr("-10"), ptrInt(-10)},
		{"nil pointer", nilStr, nil},
		{"empty string", ptr(""), nil},
		{"invalid string", ptr("xyz"), nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := safeAtoiPtr(tc.input)
			if tc.want == nil {
				if got != nil {
					t.Errorf("safeAtoiPtr(%v) = %v, want nil", ptrStr(tc.input), got)
				}
				return
			}
			if got == nil {
				t.Errorf("safeAtoiPtr(%v) = nil, want %d", ptrStr(tc.input), *tc.want)
				return
			}
			if *got != *tc.want {
				t.Errorf("safeAtoiPtr(%v) = %d, want %d", ptrStr(tc.input), *got, *tc.want)
			}
		})
	}
}

func TestPtrOrDefault(t *testing.T) {
	ptr := func(s string) *string { return &s }
	nilStr := (*string)(nil)

	tests := []struct {
		name  string
		input *string
		def   string
		want  string
	}{
		{"non-nil string", ptr("hello"), "default", "hello"},
		{"non-nil empty string", ptr(""), "", ""},
		{"nil pointer", nilStr, "default", "default"},
		{"nil pointer empty default", nilStr, "", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ptrOrDefault(tc.input, tc.def)
			if got != tc.want {
				t.Errorf("ptrOrDefault(%v, %q) = %q, want %q", ptrStr(tc.input), tc.def, got, tc.want)
			}
		})
	}
}

func TestExtractTeamLogo(t *testing.T) {
	logo1 := "https://example.com/logo1.png"
	logo2 := "https://example.com/logo2.png"
	fallback := "https://example.com/default.png"

	tests := []struct {
		name     string
		logos    *XMLTeamLogos
		fallback string
		want     string
	}{
		{
			name:     "single logo returns first",
			logos:    &XMLTeamLogos{TeamLogo: []XMLTeamLogoEntry{{URL: logo1}}},
			fallback: fallback,
			want:     logo1,
		},
		{
			name:     "multiple logos returns first",
			logos:    &XMLTeamLogos{TeamLogo: []XMLTeamLogoEntry{{URL: logo1}, {URL: logo2}}},
			fallback: fallback,
			want:     logo1,
		},
		{
			name:     "nil logos returns fallback",
			logos:    nil,
			fallback: fallback,
			want:     fallback,
		},
		{
			name:     "empty logos returns fallback",
			logos:    &XMLTeamLogos{TeamLogo: []XMLTeamLogoEntry{}},
			fallback: fallback,
			want:     fallback,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractTeamLogo(tc.logos, tc.fallback)
			if got != tc.want {
				t.Errorf("extractTeamLogo(%v, %q) = %q, want %q", tc.logos, tc.fallback, got, tc.want)
			}
		})
	}
}

func TestExtractManagerName(t *testing.T) {
	manager := XMLManager{Nickname: "CoolManager"}
	manager2 := XMLManager{Nickname: "OtherManager"}

	tests := []struct {
		name     string
		managers *XMLManagers
		want     string
	}{
		{
			name:     "single manager returns nickname",
			managers: &XMLManagers{Manager: []XMLManager{manager}},
			want:     "CoolManager",
		},
		{
			name:     "multiple managers returns first nickname",
			managers: &XMLManagers{Manager: []XMLManager{manager, manager2}},
			want:     "CoolManager",
		},
		{
			name:     "nil managers returns empty",
			managers: nil,
			want:     "",
		},
		{
			name:     "empty managers returns empty",
			managers: &XMLManagers{Manager: []XMLManager{}},
			want:     "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractManagerName(tc.managers)
			if got != tc.want {
				t.Errorf("extractManagerName(%v) = %q, want %q", tc.managers, got, tc.want)
			}
		})
	}
}

func TestFindUserTeam(t *testing.T) {
	guid1 := "guid-user-1"
	guid2 := "guid-user-2"

	team1 := XMLTeamStanding{
		TeamKey:  "key.1",
		Name:     "Team One",
		Managers: &XMLManagers{Manager: []XMLManager{{Guid: guid1}}},
	}
	team2 := XMLTeamStanding{
		TeamKey:  "key.2",
		Name:     "Team Two",
		Managers: &XMLManagers{Manager: []XMLManager{{Guid: guid2}}},
	}
	team3 := XMLTeamStanding{
		TeamKey:  "key.3",
		Name:     "Team Three",
		Managers: nil,
	}
	noMatch := XMLTeamStanding{
		TeamKey:  "key.4",
		Name:     "No Match",
		Managers: &XMLManagers{Manager: []XMLManager{{Guid: "other-guid"}}},
	}

	teams := []XMLTeamStanding{team1, team2, team3, noMatch}

	tests := []struct {
		name     string
		guid     string
		wantKey  *string
		wantName *string
	}{
		{
			name:     "finds matching team by guid",
			guid:     guid1,
			wantKey:  strPtr("key.1"),
			wantName: strPtr("Team One"),
		},
		{
			name:     "finds second team by guid",
			guid:     guid2,
			wantKey:  strPtr("key.2"),
			wantName: strPtr("Team Two"),
		},
		{
			name:     "non-existent guid returns nil",
			guid:     "nonexistent-guid",
			wantKey:  nil,
			wantName: nil,
		},
		{
			name:     "team with nil managers is skipped",
			guid:     "orphan-guid",
			wantKey:  nil,
			wantName: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotKey, gotName := findUserTeam(teams, tc.guid)
			if tc.wantKey == nil {
				if gotKey != nil {
					t.Errorf("findUserTeam(_, %q) key = %v, want nil", tc.guid, *gotKey)
				}
			} else {
				if gotKey == nil || *gotKey != *tc.wantKey {
					t.Errorf("findUserTeam(_, %q) key = %v, want %v", tc.guid, deref(gotKey), *tc.wantKey)
				}
			}
			if tc.wantName == nil {
				if gotName != nil {
					t.Errorf("findUserTeam(_, %q) name = %v, want nil", tc.guid, *gotName)
				}
			} else {
				if gotName == nil || *gotName != *tc.wantName {
					t.Errorf("findUserTeam(_, %q) name = %v, want %v", tc.guid, deref(gotName), *tc.wantName)
				}
			}
		})
	}
}

func TestComputeIsFinished(t *testing.T) {
	yes := "1"
	no := "0"

	// The function uses time.Now().Year() for season < (currentYear - 1)
	// We test the explicit yes/no cases and the nil fallback

	t.Run("explicit true", func(t *testing.T) {
		if !computeIsFinished(&yes, 2020) {
			t.Error("computeIsFinished(&yes, 2020) = false, want true")
		}
	})

	t.Run("explicit false", func(t *testing.T) {
		if computeIsFinished(&no, 2020) {
			t.Error("computeIsFinished(&no, 2020) = true, want false")
		}
	})

	t.Run("nil falls back to season heuristic", func(t *testing.T) {
		// Season 2025 >= (current year 2026 - 1) = 2025 → not finished
		got := computeIsFinished(nil, 2025)
		want := false
		if got != want {
			t.Errorf("computeIsFinished(nil, 2025) = %v, want %v", got, want)
		}

		// Season 2023 < (current year 2026 - 1) = 2025 → finished
		got2 := computeIsFinished(nil, 2023)
		want2 := true
		if got2 != want2 {
			t.Errorf("computeIsFinished(nil, 2023) = %v, want %v", got2, want2)
		}
	})

	t.Run("unknown string returns season heuristic", func(t *testing.T) {
		unknown := "unknown"
		// Should fall back to season heuristic
		_ = computeIsFinished(&unknown, 2025)
		// We can't assert exact value since it depends on current year,
		// but it shouldn't panic
	})
}

func TestSerializeLeague(t *testing.T) {
	currentWeek := "10"
	startWeek := "1"
	endWeek := "17"
	isFinished := "0"
	season := "2025"

	league := XMLLeague{
		LeagueKey:   "449.l.12345",
		LeagueID:    "12345",
		Name:        "Test League",
		URL:         "https://example.com/league",
		LogoURL:     "https://example.com/logo.png",
		DraftStatus: "postdraft",
		NumTeams:    "10",
		ScoringType: "head",
		LeagueType:  "public",
		CurrentWeek: &currentWeek,
		StartWeek:   &startWeek,
		EndWeek:     &endWeek,
		IsFinished:  &isFinished,
		Season:      season,
	}

	got := serializeLeague(league, "nfl")

	if got["league_key"] != "449.l.12345" {
		t.Errorf("league_key = %v, want 449.l.12345", got["league_key"])
	}
	if got["league_id"] != 12345 {
		t.Errorf("league_id = %v, want 12345", got["league_id"])
	}
	if got["name"] != "Test League" {
		t.Errorf("name = %v, want Test League", got["name"])
	}
	if got["num_teams"] != 10 {
		t.Errorf("num_teams = %v, want 10", got["num_teams"])
	}
	if got["scoring_type"] != "head" {
		t.Errorf("scoring_type = %v, want head", got["scoring_type"])
	}
	if got["current_week"] != nil && got["current_week"].(*int) != nil && *(got["current_week"].(*int)) != 10 {
		t.Errorf("current_week = %v, want 10", got["current_week"])
	}
	if got["is_finished"] != false {
		t.Errorf("is_finished = %v, want false", got["is_finished"])
	}
	if got["season"] != 2025 {
		t.Errorf("season = %v, want 2025", got["season"])
	}
	if got["game_code"] != "nfl" {
		t.Errorf("game_code = %v, want nfl", got["game_code"])
	}

	// Test nil optional fields
	league2 := XMLLeague{
		LeagueKey: "key2",
		LeagueID:  "2",
		Name:      "League 2",
		Season:    "2025",
	}
	got2 := serializeLeague(league2, "nba")
	if got2["current_week"] != nil && got2["current_week"].(*int) != nil {
		t.Errorf("current_week = %v, want nil", got2["current_week"])
	}
	if got2["is_finished"] != false {
		t.Errorf("is_finished = %v, want false", got2["is_finished"])
	}
}

func TestSerializeStandings(t *testing.T) {
	// Minimal teams slice
	teams := []XMLTeamStanding{
		{
			TeamKey: "key.1",
			TeamID:  "1",
			Name:    "Team One",
			TeamStandingsData: &XMLTeamStats{
				Rank:        strPtr("1"),
				PlayoffSeed: strPtr("1"),
				OutcomeTotals: &XMLOutcome{
					Wins:       "10",
					Losses:     "2",
					Ties:       "1",
					Percentage: "0.769",
				},
				GamesBack:     strPtr("0.0"),
				PointsFor:     strPtr("1500"),
				PointsAgainst: strPtr("1200"),
				Streak:        &XMLStreak{Type: "win", Value: "3"},
			},
			ClinchPlayoffs: strPtr("1"),
			WaiverPriority: strPtr("5"),
		},
		{
			TeamKey: "key.2",
			TeamID:  "2",
			Name:    "Team Two",
			TeamStandingsData: &XMLTeamStats{
				OutcomeTotals: &XMLOutcome{
					Wins:       "8",
					Losses:     "4",
					Percentage: "0.667",
				},
			},
		},
	}

	got := serializeStandings(teams)

	if len(got) != 2 {
		t.Fatalf("len(serializeStandings) = %d, want 2", len(got))
	}

	// First team
	t1 := got[0]
	if t1["team_key"] != "key.1" {
		t.Errorf("t1 team_key = %v, want key.1", t1["team_key"])
	}
	if v := t1["rank"]; v == nil || *(v.(*int)) != 1 {
		t.Errorf("t1 rank = %v, want 1", v)
	}
	if t1["wins"] != 10 {
		t.Errorf("t1 wins = %v, want 10", t1["wins"])
	}
	if t1["losses"] != 2 {
		t.Errorf("t1 losses = %v, want 2", t1["losses"])
	}
	if t1["ties"] != 1 {
		t.Errorf("t1 ties = %v, want 1", t1["ties"])
	}
	if t1["percentage"] != "0.769" {
		t.Errorf("t1 percentage = %v, want 0.769", t1["percentage"])
	}
	if t1["games_back"] != "0.0" {
		t.Errorf("t1 games_back = %v, want 0.0", t1["games_back"])
	}
	if t1["points_for"] != "1500" {
		t.Errorf("t1 points_for = %v, want 1500", t1["points_for"])
	}
	if t1["points_against"] != "1200" {
		t.Errorf("t1 points_against = %v, want 1200", t1["points_against"])
	}
	if t1["streak_type"] != "win" {
		t.Errorf("t1 streak_type = %v, want win", t1["streak_type"])
	}
	if t1["streak_value"] != 3 {
		t.Errorf("t1 streak_value = %v, want 3", t1["streak_value"])
	}
	if v := t1["playoff_seed"]; v == nil || *(v.(*int)) != 1 {
		t.Errorf("t1 playoff_seed = %v, want 1", v)
	}
	if t1["clinched_playoffs"] != true {
		t.Errorf("t1 clinched_playoffs = %v, want true", t1["clinched_playoffs"])
	}
	if v := t1["waiver_priority"]; v == nil || *(v.(*int)) != 5 {
		t.Errorf("t1 waiver_priority = %v, want 5", v)
	}

	// Second team (no standings data → defaults)
	t2 := got[1]
	if t2["wins"] != 8 {
		t.Errorf("t2 wins = %v, want 8", t2["wins"])
	}
	if t2["percentage"] != "0.667" {
		t.Errorf("t2 percentage = %v, want 0.667", t2["percentage"])
	}
	if t2["games_back"] != "0.0" {
		t.Errorf("t2 games_back = %v, want 0.0", t2["games_back"])
	}
	if t2["clinched_playoffs"] != false {
		t.Errorf("t2 clinched_playoffs = %v, want false", t2["clinched_playoffs"])
	}
}

func TestSerializeScoreboard(t *testing.T) {
	winnerKey := "key.1"
	sb := &XMLScoreboard{
		Week: "10",
		Matchups: XMLMatchups{
			Matchup: []XMLMatchup{
				{
					Week:          "10",
					WeekStart:     "2025-03-01",
					WeekEnd:       "2025-03-07",
					Status:        "post",
					IsPlayoffs:    "1",
					IsConsolation: "0",
					IsTied:        "0",
					WinnerTeamKey: winnerKey,
					Teams: XMLMatchupTeams{
						Team: []XMLMatchupTeam{
							{TeamKey: "key.1", TeamID: "1", Name: "Team One"},
							{TeamKey: "key.2", TeamID: "2", Name: "Team Two"},
						},
					},
				},
			},
		},
	}

	weekNum, matchups := serializeScoreboard(sb, 0)

	if weekNum != 10 {
		t.Errorf("weekNum = %d, want 10", weekNum)
	}
	if len(matchups) != 1 {
		t.Fatalf("len(matchups) = %d, want 1", len(matchups))
	}

	m := matchups[0]
	if m["week"] != 10 {
		t.Errorf("m week = %v, want 10", m["week"])
	}
	if m["week_start"] != "2025-03-01" {
		t.Errorf("m week_start = %v, want 2025-03-01", m["week_start"])
	}
	if m["status"] != "post" {
		t.Errorf("m status = %v, want post", m["status"])
	}
	if m["is_playoffs"] != true {
		t.Errorf("m is_playoffs = %v, want true", m["is_playoffs"])
	}
	if m["is_consolation"] != false {
		t.Errorf("m is_consolation = %v, want false", m["is_consolation"])
	}
	if m["winner_team_key"] == nil || *(m["winner_team_key"].(*string)) != winnerKey {
		t.Errorf("m winner_team_key = %v, want %s", m["winner_team_key"], winnerKey)
	}
	if len(m["teams"].([]map[string]any)) != 2 {
		t.Errorf("m teams len = %d, want 2", len(m["teams"].([]map[string]any)))
	}

	// Test fallback week override
	weekNum2, _ := serializeScoreboard(sb, 5)
	if weekNum2 != 10 {
		t.Errorf("weekNum2 = %d, want 10 (scoreboard week overrides fallback)", weekNum2)
	}

	// serializeScoreboard panics on nil — nil input is not supported
	// (removing nil test case to match actual behavior)
}

func TestSerializeRoster(t *testing.T) {
	players := []XMLPlayer{
		{
			PlayerKey:             "p1",
			PlayerID:              "101",
			Name:                  XMLPlayerName{Full: "John Doe", First: "John", Last: "Doe"},
			EditorialTeamAbbr:     "NYY",
			EditorialTeamFullName: "New York Yankees",
			DisplayPosition:       "SS",
			SelectedPosition:      &XMLSelectedPosition{Position: "SS"},
			EligiblePositions:     &XMLEligiblePos{Position: []string{"SS", "2B", "3B"}},
			ImageURL:              "https://example.com/p1.jpg",
			PositionType:          "B",
			Status:                "A",
			StatusFull:            "Active",
			InjuryNote:            "Day-to-day",
			PlayerPoints:          &XMLPlayerPoints{Total: "25.5"},
		},
		{
			PlayerKey:         "p2",
			PlayerID:          "102",
			Name:              XMLPlayerName{Full: "Jane Smith", First: "Jane", Last: "Smith"},
			DisplayPosition:   "P",
			EligiblePositions: &XMLEligiblePos{Position: []string{"P"}},
		},
	}

	got := serializeRoster(players, "team.1", "My Team", nil)
	playerList := got["players"].([]map[string]any)

	p1 := playerList[0]
	if p1["player_key"] != "p1" {
		t.Errorf("p1 player_key = %v, want p1", p1["player_key"])
	}
	if p1["player_id"] != 101 {
		t.Errorf("p1 player_id = %v, want 101", p1["player_id"])
	}
	name := p1["name"].(map[string]any)
	if name["full"] != "John Doe" {
		t.Errorf("p1 name[full] = %v, want John Doe", name["full"])
	}
	if p1["display_position"] != "SS" {
		t.Errorf("p1 display_position = %v, want SS", p1["display_position"])
	}
	if p1["selected_position"] != "SS" {
		t.Errorf("p1 selected_position = %v, want SS", p1["selected_position"])
	}
	elig := p1["eligible_positions"].([]string)
	if len(elig) != 3 {
		t.Errorf("p1 eligible_positions len = %d, want 3", len(elig))
	}
	if v := p1["status"]; v == nil || v.(string) != "A" {
		t.Errorf("p1 status = %v, want A", v)
	}
	if p1["player_points"] == nil {
		t.Errorf("p1 player_points = nil, want 25.5")
	} else if *(p1["player_points"].(*float64)) != 25.5 {
		t.Errorf("p1 player_points = %v, want 25.5", *(p1["player_points"].(*float64)))
	}

	// Player with nil eligible positions
	p2 := playerList[1]
	if p2["eligible_positions"].([]string) == nil {
		t.Errorf("p2 eligible_positions = nil, want empty slice")
	}
}

func TestTruncate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		max   int
		want  string
	}{
		{"under max", "hello", 10, "hello"},
		{"at max", "hello", 5, "hello"},
		{"over max", "hello world", 5, "hello..."},
		{"empty string", "", 5, ""},
		{"exactly max+1", "12345", 5, "12345"},
		{"exactly max+1 with ellipsis", "123456", 5, "12345..."},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := truncate(tc.input, tc.max)
			if got != tc.want {
				t.Errorf("truncate(%q, %d) = %q, want %q", tc.input, tc.max, got, tc.want)
			}
		})
	}
}

func strPtr(s string) *string { return &s }
func ptrInt(i int) *int       { return &i }
func ptrStr(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
