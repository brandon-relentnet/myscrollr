use serde::{Deserialize, Serialize, de, ser::SerializeStruct};
use log::warn;

use crate::stats::{StatDecode};

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: StatDecode + Deserialize<'de>"))]
pub struct FantasyContent<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub team: Team<T>,
}

#[derive(Debug)]
pub struct Team<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub roster: Roster<T>,
    #[allow(dead_code)]
    url: Option<String>
}

impl<'de, T> Deserialize<'de> for Team<T>
where
    T: StatDecode + Deserialize<'de>,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(field_identifier, rename_all = "lowercase")]
        enum Field {
            Roster,
            Url,
            #[serde(other)]
            Other,
        }

        struct TeamVisitor<T>
        where
            T: StatDecode,
            <T as TryFrom<u32>>::Error: std::fmt::Display,
        {
            phantom: std::marker::PhantomData<T>,
        }

        impl<'de, T> de::Visitor<'de> for TeamVisitor<T>
        where
            T: StatDecode + Deserialize<'de>,
            <T as TryFrom<u32>>::Error: std::fmt::Display,
        {
            type Value = Team<T>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("struct Team")
            }

            fn visit_map<V>(self, mut map: V) -> Result<Team<T>, V::Error>
            where
                V: de::MapAccess<'de>,
            {
                let mut roster: Option<Roster<T>> = None;
                let mut url: Option<String> = None;

                while let Some(key) = map.next_key()? {
                    match key {
                        Field::Roster => {
                            if roster.is_some() {
                                return Err(de::Error::duplicate_field("roster"));
                            }
                            roster = Some(map.next_value()?);
                        }
                        Field::Url => {
                            if url.is_some() {
                                return Err(de::Error::duplicate_field("url"));
                            }
                            let url_value: String = map.next_value()?;

                            // Validate URL immediately when we get it
                            let expected_sport = T::expected_sport();
                            if !url_value.contains(expected_sport) {
                                return Err(de::Error::custom(format!(
                                    "Sport validation failed: URL '{}' does not match expected sport '{}'. \
                                    You requested {} stats but this team plays a different sport.",
                                    url_value, expected_sport, expected_sport
                                )));
                            }
                            url = Some(url_value);
                        }
                        Field::Other => {
                            let _: de::IgnoredAny = map.next_value()?;
                        }
                    }
                }

                let roster = roster.ok_or_else(|| de::Error::missing_field("roster"))?;

                Ok(Team { roster, url })
            }
        }

        deserializer.deserialize_struct(
            "Team",
            &["roster", "url"],
            TeamVisitor {
                phantom: std::marker::PhantomData,
            },
        )
    }
}

#[derive(Debug, Deserialize)]
pub struct Roster<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub players: Players<T>
}

#[derive(Debug, Deserialize)]
pub struct Players<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub player: Option<Vec<Player<T>>>
}

#[derive(Debug, Deserialize)]
pub struct Player<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub player_key: String,
    pub player_id: u32,
    pub name: Name,
    pub editorial_team_abbr: String,
    pub editorial_team_full_name: String,
    #[serde(default)]
    pub uniform_number: Option<String>,
    pub display_position: String,
    pub selected_position: SelectedPosition,
    pub eligible_positions: EligiblePositions,
    pub image_url: String,
    pub headshot: Headshot,
    pub is_undroppable: bool,
    pub position_type: String,
    pub player_stats: PlayerStats<T>,
    pub player_points: Option<PlayerPoints>,
}

#[derive(Debug, Deserialize)]
pub struct Name {
    pub full: String,
    pub first: String,
    pub last: String,
}

#[derive(Debug, Deserialize)]
pub struct EligiblePositions {
    pub position: Vec<String>
}

#[derive(Debug, Deserialize)]
pub struct SelectedPosition {
    pub position: String
}

#[derive(Debug, Deserialize)]
pub struct Headshot {
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PlayerPoints {
    pub coverage_type: String,
    pub week: Option<u8>,
    pub date: Option<String>,
    pub total: f32,
}

#[derive(Debug, Deserialize)]
pub struct PlayerStats<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub stats: Stats<T>,
}

#[derive(Debug, Deserialize)]
pub struct Stats<T>
where
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    pub stat: Vec<Stat<T>>
}

#[derive(Debug)]
pub struct Stat<T> 
{
    pub stat_name: T,
    value: u32,
}

impl<'de, T> Deserialize<'de> for Stat<T> 
where 
    T: StatDecode,
    <T as TryFrom<u32>>::Error: std::fmt::Display,

{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>
    {
        #[derive(Deserialize)]
        struct StatXml {
            #[serde(rename = "stat_id")]
            raw_id: u32,
            value: String,
        }

        let temp = StatXml::deserialize(deserializer)?;

        let stats_enum = T::try_from(temp.raw_id)
            .map_err(de::Error::custom)?;

        let parsed_value = temp.value.parse::<u32>()
            .unwrap_or_else(|e| {
                if temp.value == "-" || temp.value == "-/-" {
                    0
                } else {
                    warn!("Stat value parsing failed for ID {}: {} (Defaulting to 0) value: {}", temp.raw_id, e, temp.value);
                    0
                }
            });

        Ok(Stat {
            stat_name: stats_enum,
            value: parsed_value,
        })
    }
}

impl<T> Serialize for Stat<T> 
where
    T: StatDecode + std::fmt::Display + serde::Serialize
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer
    {
        let mut state = serializer.serialize_struct("Stat", 2)?;

        
        state.serialize_field("name", &self.stat_name)?;

        state.serialize_field("value", &self.value)?;

        state.end()
    }
}