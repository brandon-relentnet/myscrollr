import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import "./api/fetchOverride";
import { initStore } from "./lib/store";
import { createQueryClient } from "./query";
import { createAppRouter } from "./router";
import "./style.css";

const queryClient = createQueryClient();

initStore().catch((err) => console.error("[Scrollr] Store init failed:", err)).then(() => {
  const router = createAppRouter(queryClient);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </MotionConfig>
    </StrictMode>,
  );
});
