export const API_URL = 'https://api.myscrollr.relentnet.dev';
export const SSE_URL = `${API_URL}/events`;

export const LOGTO_ENDPOINT = 'https://auth.myscrollr.relentnet.dev';
export const LOGTO_APP_ID = 'kq298uwwusrvw8m6yn6b4';
export const LOGTO_RESOURCE = API_URL;

/** Maximum number of items kept in memory per category. */
export const MAX_ITEMS = 50;

/** SSE reconnect: initial delay in ms. */
export const SSE_RECONNECT_BASE = 1000;

/** SSE reconnect: maximum delay in ms. */
export const SSE_RECONNECT_MAX = 30_000;
