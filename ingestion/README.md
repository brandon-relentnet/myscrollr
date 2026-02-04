# Scrollr

## Quick Start
1. Download and install Rust from [here](https://rust-lang.org/learn/get-started/).
2. Clone this repository.
3. Rename .env.example as .env and fill out any missing information.
4. Make start.sh executable if it isn't.
5. Generate and run the release build of this backend by running start.sh with `./start.sh`
6. That's it, the compiled program now exists at the new `/release` folder in the root directory, this also happens to be where you can find logs, configuration information, as well as your the active.env. Once the `/release` directory is generated you can run the program again in the future either by using `./start` again or by entering the `/release` folder and manually running the program with `./scrollr_backend`. 

## API

### Yahoo Fantasy Sports
##### Base Endpoint: /yahoo

##### Initial Authentication with Yahoo: /start
This is the starting point for Yahoo Authentication and will redirect the user to a Yahoo login page. This is not for refreshing an expired access_token, any other `/yahoo` endpoint should be capable of refreshing an expired token, do not use this one.

##### Callback: /yahoo/callback
This endpoint is stored with Yahoo as a way to verify they are interacting with who our app claims to be, any user of `/start` will be redirected here after logging in to Yahoo. This endpoint also provisions our users with their access and refresh tokens.

##### User Leagues: /leagues

Authentication

 * Headers:
 ```
 Authorization: bearer <Access Token>
 Content-Type: application/json
 ```
 * Request Body: ` { "refresh_token": "<Refresh Token>" } `



Json Response :
```
{
	nba: [
		0: {
			league_key: 	"League Key",
			league_id:		0000000,
			name:			"League Name",
			url:			"https://league_url.com",
			logo_url:		"https://league_logo.com",
			draft_status: 	"Draft Status",
			num_teams: 		0,
			scoring_type: 	"Scoring Type"
			league_type: 	"public",
			current_week: 	0,
			start_week: 	0,
			end_week: 		0,
			season: 		2025,
			game_code: 		"nba"
		}
	],
	nfl: [
    	0: {
			league_key: 	"League Key",
			league_id:		0000000,
			name:			"League Name",
			url:			"https://league_url.com",
			logo_url:		"https://league_logo.com",
			draft_status: 	"Draft Status",
			num_teams: 		0,
			scoring_type: 	"Scoring Type"
			league_type: 	"public",
			current_week: 	0,
			start_week: 	0,
			end_week: 		0,
			season: 		2025,
			game_code: 		"nfl"
		}
    ]
}
```

##### League Standings: /league/{leagueKey}/standings

Authentication

 * Headers:
 ```
 Authorization: bearer <Access Token>
 Content-Type: application/json
 ```
 * Request Body: ` { "refresh_token": "<Refresh Token>" } `

Json Response :
```
{
	standings: [
    	0: {
        	team_key: "Team Key",
            team_id: 0,
            name: "Team Name",
            url: "https://team_url.com",
            team_logo: "https://team_logo.com",
            wins: 0,
            losses: 0,
            ties: 0,
            percentage: "percentage",	// Could be an empty string: ""
            games_back: 0.0,
            points_for: 0.0,
            points_against: 0.0
        }
    ]
}
```

##### Team Roster: /team/{teamKey}/roster

Query Parameters
```
sport=<sport>			// This is required
						// Currently supports: 
                        // nfl or football,
                        // nba or basketball,
                        // nhl or hockey,
                        
date=<year-month-day>	// Optional, date is not always allowed by the Yahoo API if that is the case
						// the back end server will automatically retry the request without a date.
```

Authentication

* Headers:
```
Authorization: bearer <Access Token>
Content-Type: application/json
```
* Request Body: ` { "refresh_token": "<Refresh Token>" } `

Json Response :
```
{
	roster: [
    	id: 00000,
        key: "Player Key",
        name: "Player Name",
        firstName: "First Name",
        lastName: "Last Name",
        teamAbbr: "Team Abbreviation",
        teamFullName: "Full Team Name",
        uniformNumber: "00",
        position: "Position",
        selectedPosition: "Selected Position",
        eligiblePositions: [
        	0: "Eligible Position"
        ],
        imageUrl: "https://player_image.com",
        headshot: "https://player_image.com",	// Believed to always be the same Url as imageUrl
        isUndroppable: true,
        positionType: O,
        stats: [
        	0: {
            	name: "stat name",
                value: 0
            }
        ],
        playerPoints: {
        	coverage_type: "week",
            week: 0 || null,
            date: "year-month-day" || null,
            total: 00.00
        }
    ]
}
```

##### Team Matchups: /team/{teamKey}/matchups

Authentication

 * Headers:
 ```
 Authorization: bearer <Access Token>
 Content-Type: application/json
 ```
 * Request Body: ` { "refresh_token": "<Refresh Token>" } `

Json Response :
```
{
	completed_matches: [
    	0: {
        	teams: [
				0: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				},
				1: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				}
			]
        }
    ]

	active_matches: [
    	0: {
        	teams: [
				0: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				},
				1: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				}
			]
        }
    ]

	future_matches: [
    	0: {
        	teams: [
				0: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				},
				1: {
					team_key: "Team Key",
					team_name: "Team Name",
					team_points: 0.00
				}
			]
        }
    ]
}
```