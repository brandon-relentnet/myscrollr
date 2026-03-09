import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import MainApp from "./MainApp";
import "./style.css";

// Selective fetch override: route API calls through Tauri's plugin-http
// (bypasses browser CORS via Rust's reqwest), but leave all other fetches
// (Vite HMR, webview internals, local resources) on the native path.
const API_HOST = "api.myscrollr.relentnet.dev";
const nativeFetch = window.fetch.bind(window);

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  let url: string;
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    url = input.url;
  }

  if (url.includes(API_HOST)) {
    return tauriFetch(input, init);
  }
  return nativeFetch(input, init);
}) as typeof window.fetch;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MainApp />
  </StrictMode>,
);
