import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "./lib/context";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
const client = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});
registerSW({
    onNeedRefresh() {
        window.dispatchEvent(new Event("viva-update"));
    },
});
createRoot(document.getElementById("root")).render(
    <StrictMode>
        <QueryClientProvider client={client}>
            <BrowserRouter>
                <AppProvider>
                    <App />
                </AppProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
);
