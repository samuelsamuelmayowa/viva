import react from "@vitejs/plugin-react";
const apiPort = "8000";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "viva.png",
        "viva-192.png",
        "viva-512.png",
        "background-sync.js",
      ],
      manifest: {
        name: "Viva Business Management",
        short_name: "Viva",
        theme_color: "#155e52",
        background_color: "#f6f8fa",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/viva.png", sizes: "192x192", type: "image/png" },
          { src: "/viva.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        importScripts: ["/background-sync.js"],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.VIVA_API_URL || "http://localhost:" + apiPort,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.VIVA_API_URL || "http://localhost:" + apiPort,
        changeOrigin: false,
      },
    },
  },
});
