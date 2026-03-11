import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./api/fetchOverride";
import { createQueryClient } from "./query";
import { createAppRouter } from "./router";
import "./style.css";

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
