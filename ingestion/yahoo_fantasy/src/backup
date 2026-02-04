use std::fmt::Debug;

use serde::{Deserialize, Serialize};



pub trait StatDecode: TryFrom<u32> + Debug + Sized {
    fn expected_sport() -> &'static str;
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum HockeyStats {
    Goals, // ID 1
    Assists, // ID 2
    PlusMinus, // ID 4
    PowerplayPoints, // ID 8,
    ShotsOnGoal, // ID 14,
    Wins, // ID 19,
    GoalsAgainst, // ID 22,
    Saves, // ID 25,
    Shutouts, // ID 27  
    Blocks, // ID 32,
}

impl StatDecode for HockeyStats {
    fn expected_sport() -> &'static str {
        "hockey"
    }
}

impl TryFrom<u32> for HockeyStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Goals),
            2 => Ok(Self::Assists),
            4 => Ok(Self::PlusMinus),
            8 => Ok(Self::PowerplayPoints),
            14 => Ok(Self::ShotsOnGoal),
            19 => Ok(Self::Wins),
            22 => Ok(Self::GoalsAgainst),
            25 => Ok(Self::Saves),
            27 => Ok(Self::Shutouts),
            32 => Ok(Self::Blocks),
            _ => Err(format!("TryFrom not implemented for Hockey Stat ID({value})"))
        }
    }
}

impl std::fmt::Display for HockeyStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = format!("{:?}", self);
        let mut result = String::new();
        let mut chars = name.chars().peekable();

        while let Some(c) = chars.next() {
            if c.is_uppercase() && result.len() > 0 {
                if let Some(last_char) = result.chars().last() {
                    if last_char.is_lowercase() {
                        result.push(' ');
                    }
                }
            }
            result.push(c);
        }
        
        write!(f, "{}", result.to_lowercase())
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum BasketballStats {
    MinutesPlayed, // ID 1
    ThreePointAttempts, // ID 4
    FieldGoalPercentage, // ID 5
    FreeThrowPercentage, // ID 8
    ThreePointShotsMade, // ID 10
    PointsScored, // ID 12
    TotalRebounds, // ID 15
    Assists, // ID 16
    Steals, // ID 17
    BlockedShots, // ID 18
    Turnovers, // ID 19
    FieldGoalsMade, // ID 9004003
    FreeThrowsMade, // ID 9007006
}

impl StatDecode for BasketballStats {
    fn expected_sport() -> &'static str {
        "basketball"
    }
}

impl TryFrom<u32> for BasketballStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::MinutesPlayed),
            4 => Ok(Self::ThreePointAttempts),
            5 => Ok(Self::FieldGoalPercentage),
            8 => Ok(Self::FreeThrowPercentage),
            10 => Ok(Self::ThreePointShotsMade),
            12 => Ok(Self::PointsScored),
            15 => Ok(Self::TotalRebounds),
            16 => Ok(Self::Assists),
            17 => Ok(Self::Steals),
            18 => Ok(Self::BlockedShots),
            19 => Ok(Self::Turnovers),
            9004003 => Ok(Self::FieldGoalsMade),
            9007006 => Ok(Self::FreeThrowsMade),
            _ => Err(format!("TryFrom not implemented for Basketball Stat ID({value})"))
        }
    }
}

impl std::fmt::Display for BasketballStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = format!("{:?}", self);
        let mut result = String::new();
        let mut chars = name.chars().peekable();

        while let Some(c) = chars.next() {
            if c.is_uppercase() && result.len() > 0 {
                if let Some(last_char) = result.chars().last() {
                    if last_char.is_lowercase() {
                        result.push(' ');
                    }
                }
            }
            result.push(c);
        }
        
        write!(f, "{}", result.to_lowercase())
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum FootballStats {
// General Stats (O, DP, K, DT)
    GamesPlayed, // ID 0
    
    // Offensive Stats (O)
    PassingAttempts, // ID 1
    Completions, // ID 2
    IncompletePasses, // ID 3
    PassingYards, // ID 4
    PassingTouchdowns, // ID 5
    InterceptionsThrown, // ID 6 (Clarified as 'thrown' for offensive players)
    SacksTaken, // ID 7 (Clarified as 'taken' for offensive players)
    RushingAttempts, // ID 8
    RushingYards, // ID 9
    RushingTouchdowns, // ID 10
    Receptions, // ID 11
    ReceivingYards, // ID 12
    ReceivingTouchdowns, // ID 13
    ReturnYardsOffense, // ID 14 (Clarified as 'Offense' or 'Returner')
    ReturnTouchdownsOffense, // ID 15
    TwoPointConversions, // ID 16
    Fumbles, // ID 17
    FumblesLost, // ID 18
    
    // Kicking Stats (K)
    FieldGoals0to19Made, // ID 19
    FieldGoals20to29Made, // ID 20
    FieldGoals30to39Made, // ID 21
    FieldGoals40to49Made, // ID 22
    FieldGoals50PlusMade, // ID 23
    FieldGoalsMissed0to19, // ID 24
    FieldGoalsMissed20to29, // ID 25
    FieldGoalsMissed30to39, // ID 26
    FieldGoalsMissed40to49, // ID 27
    FieldGoalsMissed50Plus, // ID 28
    PointAfterAttemptMade, // ID 29
    PointAfterAttemptMissed, // ID 30
    
    // Defense/Special Teams (DT/DP) - Start of defensive stats
    PointsAllowedDT, // ID 31 (DT = Defense Team)
    SackDT, // ID 32
    InterceptionDT, // ID 33
    FumbleRecoveryDT, // ID 34
    
    // Remaining defensive/special teams stats
    TouchdownDT, // ID 35
    SafetyDT, // ID 36
    BlockKickDT, // ID 37
    TackleSoloDP, // ID 38 (DP = Defensive Player)
    TackleAssistDP, // ID 39

    SackDP, // ID 40
    InterceptionDP, // ID 41
    FumbleForceDP, // ID 42
    FumbleRecoveryDP, // ID 43
    DefensiveTouchdownDP, // ID 44
    SafetyDP, // ID 45
    PassDefendedDP, // ID 46
    BlockKickDP, // ID 47
    ReturnYardsDT, // ID 48
    KickoffAndPuntReturnTouchdownsDT, // ID 49
    PointsAllowed0, // ID 50
    PointsAllowed1To6, // ID 51
    PointsAllowed7To13, // ID 52
    PointsAllowed14To20, // ID 53
    PointsAllowed21To27, // ID 54
    PointsAllowed28To34, // ID 55
    PointsAllowed35Plus, // ID 56
    OffensiveFumbleReturnTD, // ID 57
    PickSixesThrown, // ID 58
    FortyPlusYardCompletions, // ID 59
    FortyPlusYardPassingTouchdowns, // ID 60
    FortyPlusYardRun, // ID 61
    FortyPlusYardRushingTouchdowns, // ID 62
    FortyPlusYardReceptions, // ID 63
    FortyPlusYardReceivingTouchdowns, // ID 64
    TacklesForLossDP, // ID 65
    TurnoverReturnYardsDP, // ID 66
    FourthDownStops, // ID 67
    TacklesForLossDT, // ID 68
    DefensiveYardsAllowed, // ID 69
    DefensiveYardsAllowedNegative, // ID 70
    DefensiveYardsAllowed0To99, // ID 71
    DefensiveYardsAllowed100To199, // ID 72
    DefensiveYardsAllowed200To299, // ID 73
    DefensiveYardsAllowed300To399, // ID 74
    DefensiveYardsAllowed400To499, // ID 75
    DefensiveYardsAllowed500Plus, // ID 76
    ThreeAndOutsForced, // ID 77
    Targets, // ID 78
    PassingFirstDowns, // ID 79
    ReceivingFirstDowns, // ID 80
    RushingFirstDowns, // ID 81
    ExtraPointReturnedDT, // ID 82
    ExtraPointReturnedDP, // ID 83
    FieldGoalsTotalYards, // ID 84
    FieldGoalsMade, // ID 85
    FieldGoalsMissed, // ID 86
}

impl StatDecode for FootballStats {
    fn expected_sport() -> &'static str {
        "football"
    }
}

impl std::fmt::Display for FootballStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = format!("{:?}", self);
        let mut result = String::new();
        let mut chars = name.chars().peekable();

        while let Some(c) = chars.next() {
            if c.is_uppercase() && result.len() > 0 {
                if let Some(last_char) = result.chars().last() {
                    if last_char.is_lowercase() {
                        result.push(' ');
                    }
                }
            }
            result.push(c);
        }
        
        write!(f, "{}", result.to_lowercase())
    }
}

impl TryFrom<u32> for FootballStats {
    type Error = String;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::GamesPlayed),
            1 => Ok(Self::PassingAttempts),
            2 => Ok(Self::Completions),
            3 => Ok(Self::IncompletePasses),
            4 => Ok(Self::PassingYards),

            5 => Ok(Self::PassingTouchdowns),
            6 => Ok(Self::InterceptionsThrown),
            7 => Ok(Self::SacksTaken),
            8 => Ok(Self::RushingAttempts),
            9 => Ok(Self::RushingYards),

            10 => Ok(Self::RushingTouchdowns),
            11 => Ok(Self::Receptions),
            12 => Ok(Self::ReceivingYards),
            13 => Ok(Self::ReceivingTouchdowns),
            14 => Ok(Self::ReturnYardsOffense),
            
            15 => Ok(Self::ReturnTouchdownsOffense),
            16 => Ok(Self::TwoPointConversions),
            17 => Ok(Self::Fumbles),
            18 => Ok(Self::FumblesLost),
            19 => Ok(Self::FieldGoals0to19Made),
            
            20 => Ok(Self::FieldGoals20to29Made),
            21 => Ok(Self::FieldGoals30to39Made),
            22 => Ok(Self::FieldGoals40to49Made),
            23 => Ok(Self::FieldGoals50PlusMade),
            24 => Ok(Self::FieldGoalsMissed0to19),

            25 => Ok(Self::FieldGoalsMissed20to29),
            26 => Ok(Self::FieldGoalsMissed30to39),
            27 => Ok(Self::FieldGoalsMissed40to49),
            28 => Ok(Self::FieldGoalsMissed50Plus),
            29 => Ok(Self::PointAfterAttemptMade),

            30 => Ok(Self::PointAfterAttemptMissed),
            31 => Ok(Self::PointsAllowedDT),
            32 => Ok(Self::SackDT),
            33 => Ok(Self::InterceptionDT),
            34 => Ok(Self::FumbleRecoveryDT),
            
            35 => Ok(Self::TouchdownDT),
            36 => Ok(Self::SafetyDT),
            37 => Ok(Self::BlockKickDT),
            38 => Ok(Self::TackleSoloDP),
            39 => Ok(Self::TackleAssistDP),

            40 => Ok(Self::SackDP),
            41 => Ok(Self::InterceptionDP),
            42 => Ok(Self::FumbleForceDP),
            43 => Ok(Self::FumbleRecoveryDP),
            44 => Ok(Self::DefensiveTouchdownDP),
            45 => Ok(Self::SafetyDP),
            46 => Ok(Self::PassDefendedDP),
            47 => Ok(Self::BlockKickDP),
            48 => Ok(Self::ReturnYardsDT),
            49 => Ok(Self::KickoffAndPuntReturnTouchdownsDT),
            50 => Ok(Self::PointsAllowed0),
            51 => Ok(Self::PointsAllowed1To6),
            52 => Ok(Self::PointsAllowed7To13),
            53 => Ok(Self::PointsAllowed14To20),
            54 => Ok(Self::PointsAllowed21To27),
            55 => Ok(Self::PointsAllowed28To34),
            56 => Ok(Self::PointsAllowed35Plus),
            57 => Ok(Self::OffensiveFumbleReturnTD),
            58 => Ok(Self::PickSixesThrown),
            59 => Ok(Self::FortyPlusYardCompletions),
            60 => Ok(Self::FortyPlusYardPassingTouchdowns),
            61 => Ok(Self::FortyPlusYardRun),
            62 => Ok(Self::FortyPlusYardRushingTouchdowns),
            63 => Ok(Self::FortyPlusYardReceptions),
            64 => Ok(Self::FortyPlusYardReceivingTouchdowns),
            65 => Ok(Self::TacklesForLossDP),
            66 => Ok(Self::TurnoverReturnYardsDP),
            67 => Ok(Self::FourthDownStops),
            68 => Ok(Self::TacklesForLossDT),
            69 => Ok(Self::DefensiveYardsAllowed),
            70 => Ok(Self::DefensiveYardsAllowedNegative),
            71 => Ok(Self::DefensiveYardsAllowed0To99),
            72 => Ok(Self::DefensiveYardsAllowed100To199),
            73 => Ok(Self::DefensiveYardsAllowed200To299),
            74 => Ok(Self::DefensiveYardsAllowed300To399),
            75 => Ok(Self::DefensiveYardsAllowed400To499),
            76 => Ok(Self::DefensiveYardsAllowed500Plus),
            77 => Ok(Self::ThreeAndOutsForced),
            78 => Ok(Self::Targets),
            79 => Ok(Self::PassingFirstDowns),
            80 => Ok(Self::ReceivingFirstDowns),
            81 => Ok(Self::RushingFirstDowns),
            82 => Ok(Self::ExtraPointReturnedDT),
            83 => Ok(Self::ExtraPointReturnedDP),
            84 => Ok(Self::FieldGoalsTotalYards),
            85 => Ok(Self::FieldGoalsMade),
            86 => Ok(Self::FieldGoalsMissed),
            _ => Err(format!("TryFrom not implemented for Stat ID({value})"))
        }
    }
}