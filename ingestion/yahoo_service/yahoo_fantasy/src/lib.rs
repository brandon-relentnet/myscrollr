use std::error::Error;

use oauth2::{AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, RefreshToken, Scope, TokenResponse, TokenUrl, basic::BasicClient, reqwest::Client};
use secrecy::{SecretString, ExposeSecret};
use log::error;

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
pub mod debug;

pub use types::YahooHealth;

pub async fn yahoo(client_id: String, client_secret: String, callback_url: String) -> Result<(String, String), Box<dyn Error>> {
    let csrf_token = CsrfToken::new_random();

    let client = BasicClient::new(ClientId::new(client_id))
        .set_client_secret(ClientSecret::new(client_secret))
        .set_auth_uri(AuthUrl::new(AUTH_URL.to_string())?)
        .set_token_uri(TokenUrl::new(TOKEN_URL.to_string())?)
        .set_redirect_uri(RedirectUrl::new(callback_url)?);

    // State validation is the responsibility of the caller before exchanging the code.
    // The csrf_token generated here should be stored by the caller and compared against
    // the 'state' parameter returned by Yahoo in the callback.
    let (auth_url, csrf_token) = client
        .authorize_url(|| csrf_token)
        .add_scope(Scope::new("fspt-r".to_string()))
        .url();
    
    return Ok((auth_url.as_str().to_string(), csrf_token.into_secret()));
}

pub async fn exchange_for_token(authorization_code: String, client_id: String, client_secret: String, _csrf: String, callback_url: String) -> Option<Tokens> {
    let client = BasicClient::new(ClientId::new(client_id.clone()))
        .set_client_secret(ClientSecret::new(client_secret.clone()))
        .set_auth_uri(AuthUrl::new(AUTH_URL.to_string()).unwrap())
        .set_token_uri(TokenUrl::new(TOKEN_URL.to_string()).unwrap())
        .set_redirect_uri(RedirectUrl::new(callback_url.clone()).unwrap());

    let http_client = Client::new();

    let token_result = client
        .exchange_code(AuthorizationCode::new(authorization_code))
        .request_async(&http_client)
        .await
        .inspect_err(|e| error!("Failed exchanging Auth Token for Access Token: {e}"));

    if token_result.is_err() { return None };

    let tokens = token_result.unwrap();
    let access_token = tokens.access_token();
    let refresh_token = if let Some(token) = tokens.refresh_token() {
        Some(SecretString::new(token.clone().into_secret().into_boxed_str()))
    } else {
        None
    };

    Some(Tokens {
        access_token: SecretString::new(access_token.clone().into_secret().into_boxed_str()),
        refresh_token,
        client_id: client_id.clone(),
        client_secret: SecretString::new(client_secret.into_boxed_str()),
        callback_url,
        access_type: String::new(),
    })
}

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