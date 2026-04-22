CREATE TABLE IF NOT EXISTS standings (
    id             SERIAL PRIMARY KEY,
    league         VARCHAR(50) NOT NULL,
    team_name      VARCHAR(100) NOT NULL,
    team_code      VARCHAR(10),
    team_logo      VARCHAR(500),
    rank           INTEGER,
    wins           INTEGER NOT NULL DEFAULT 0,
    losses         INTEGER NOT NULL DEFAULT 0,
    draws          INTEGER NOT NULL DEFAULT 0,
    points         INTEGER,
    games_played   INTEGER NOT NULL DEFAULT 0,
    goal_diff      INTEGER,
    description    VARCHAR(200),
    form           VARCHAR(20),
    group_name     VARCHAR(100),
    season         VARCHAR(20),
    updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league, team_name, season)
);

CREATE TABLE IF NOT EXISTS teams (
    id             SERIAL PRIMARY KEY,
    league         VARCHAR(50) NOT NULL,
    external_id    INTEGER NOT NULL,
    name           VARCHAR(100) NOT NULL,
    code           VARCHAR(10),
    logo           VARCHAR(500),
    country        VARCHAR(100),
    season         VARCHAR(20),
    updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league, external_id, season)
);
