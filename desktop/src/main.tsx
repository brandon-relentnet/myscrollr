import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import "./api/fetchOverride";
import { initStore } from "./lib/store";
import { createQueryClient } from "./query";
import App from "./App";
import "./style.css";

const queryClient = createQueryClient();

initStore().catch((err) => console.error("[Scrollr] Store init failed:", err)).then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </MotionConfig>
    </StrictMode>,
  );
});
