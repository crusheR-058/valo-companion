import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { inTauri } from "./lib";
import { Overlay } from "./pages/Live";
import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/bodoni-moda/opsz-italic.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const isOverlay = inTauri && getCurrentWindow().label === "overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>{isOverlay ? <Overlay /> : <App />}</QueryClientProvider>
  </React.StrictMode>,
);
