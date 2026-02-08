use std::error::Error;

use oauth2::{AuthUrl, ClientId, ClientSecret, RedirectUrl, RefreshToken, TokenResponse, TokenUrl, basic::BasicClient, reqwest::Client};
use secrecy::{SecretString, ExposeSecret};

use crate::types::Tokens;


const AUTH_URL: &str = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL: &str = "https://api.login.yahoo.com/oauth2/get_token";

pub mod api;
mod xml_leagues;
mod xml_standings;
mod xml_roster;
mod xml_settings;
mod xml_matchups;
mod error;
mod utilities;
pub mod stats;
pub mod types;

pub use types::YahooHealth;

pub(crate) async fn exchange_refresh(client_id: String, client_secret: SecretString, callback_url: String, old_refresh_token: SecretString) -> Result<(String, String), Box<dyn Error>> {
    let client = BasicClient::new(ClientId::new(client_id))
        .set_client_secret(ClientSecret::new(client_secret.expose_secret().to_string()))
        .set_auth_uri(AuthUrl::new(AUTH_URL.to_string())?)
        .set_token_uri(TokenUrl::new(TOKEN_URL.to_string())?)
        .set_redirect_uri(RedirectUrl::new(callback_url)?);

    let http_client = Client::new();
    let refresh_token = RefreshToken::new(old_refresh_token.expose_secret().to_string());

    let token_result = client
        .exchange_refresh_token(&refresh_token)
        .request_async(&http_client)
        .await?;

    let new_access_token = token_result.access_token().secret().to_string();

    let new_refresh_token = match token_result.refresh_token() {
        Some(t) => t.secret().to_string(),
        None => refresh_token.secret().to_string(),
    };

    Ok((new_access_token, new_refresh_token))
}