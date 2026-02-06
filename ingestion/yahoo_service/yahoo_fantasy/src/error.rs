use std::error::Error;
use secrecy::SecretString;
use serde::Deserialize;
use log::error;

use crate::exchange_refresh;

#[derive(Debug)]
pub enum YahooError {
    Ok,
    NewTokens(String, String),
    Failed,
    Error(String),
}

impl std::fmt::Display for YahooError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            YahooError::Ok => write!(f, "YahooError::Ok"),
            YahooError::NewTokens(_, _) => write!(f, "YahooError::NewTokens([REDACTED], [REDACTED])"),
            YahooError::Failed => write!(f, "YahooError::Failed"),
            YahooError::Error(e) => write!(f, "YahooError({})", e),
        }
    }
}

impl Error for YahooError {}

impl YahooError {
    pub async fn check_response(response: String, client_id: String, client_secret: SecretString, callback_url: String, refresh_token: Option<SecretString>) -> YahooError {
        let cleaned = serde_xml_rs::from_str::<YahooNamespacedErrorResponse>(&response)
            .map(|e| e.description)
            // If that fails, try without namespace (regular API errors)
            .or_else(|_| serde_xml_rs::from_str::<YahooErrorResponse>(&response).map(|e| e.description));

        match cleaned {
            Ok(error) => {
                let raw_msg = error;
                let error_type = Self::handle_checks(raw_msg);

                if &error_type == "token_expired" {
                    if let Some(token) = refresh_token {
                        match exchange_refresh(client_id, client_secret, callback_url, token).await {
                            Ok((a, b)) => return Self::NewTokens(a, b),
                            Err(e) => {
                                error!("Failed to refresh token: {e}");
                                return Self::Failed;
                            }
                        }
                    } else {
                        return Self::Failed;
                    }
                } else if error_type.contains("This game does not support accessing a roster by date") {
                    return Self::Error("date unsupported".to_string())
                } else if error_type.contains("You must be logged in") {
                    return Self::Failed;
                } else {
                    return Self::Error(error_type);
                }
            },
            Err(_) => {
                return Self::Ok;
            },
        }
    }

    fn handle_checks(message: String) -> String {
        // Check if it's an OAuth error message
        if let Some((_description, pairs)) = message.split_once(" OAuth ") {
            if let Some((error, _realm)) = pairs.split_once(',') {
                if let Some((key, value)) = error.split_once('=') {
                    let trimmed_value = value
                        .strip_prefix('"')
                        .and_then(|s| s.strip_suffix('"'))
                        .unwrap_or(value);
                    match key {
                        "oauth_problem" => {
                            match trimmed_value {
                                "token_expired" | "token_missing" => {
                                    return "token_expired".to_string();
                                }
                                "unable_to_determine_oauth_type" => {
                                    error!("OAuth logic error, this should not be reachable.");
                                    return "OAuth logic error, this should not be reachable.".to_string()
                                }
                                _ => return format!("Unexpected yahoo error: (key: {key}, value: {value})"),
                            }
                        }
                        _ => return format!("Unexpected yahoo error: (key: {key}, value: {value})"),
                    }
                }
            }
        }

        // If not an OAuth error, return the raw message (regular API error)
        message
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename = "yahoo:error")]
struct YahooNamespacedErrorResponse {
    #[serde(rename = "yahoo:description")]
    description: String,
}

// For regular API errors without namespace
#[derive(Debug, Deserialize)]
#[serde(rename = "error")]
struct YahooErrorResponse {
    description: String,
}