import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { inTauri, useSettings } from "./lib";
import { Overlay } from "./pages/Live";
import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/bodoni-moda/opsz-italic.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const isOverlay = (inTauri && getCurrentWindow().label === "overlay") || (import.meta.env.DEV && location.search.includes("overlay"));
// Dev only: ?theme=daylight previews a theme without touching saved settings UI.
if (import.meta.env.DEV) { const t = new URLSearchParams(location.search).get("theme"); if (t) useSettings.getState().set({ theme: t }); }

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>{isOverlay ? <Overlay /> : <App />}</QueryClientProvider>
  </React.StrictMode>,
);
