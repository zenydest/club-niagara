import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // PWA para offline-first en web
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // Cachear todos los assets para funcionar offline
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Cachear GET /api/productos para funcionar offline
            urlPattern: /\/api\/productos/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "niagara-productos",
              expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24 horas
            },
          },
        ],
      },
      manifest: {
        name: "Club Niágara Caja",
        short_name: "Club Niágara POS",
        description: "Sistema de caja offline-first para boliches",
        theme_color: "#08080F",
        background_color: "#08080F",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
