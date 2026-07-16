import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true, // Para acceso desde otros dispositivos en la red local
  },
  build: {
    // En Vercel (VERCEL=1 pasa via globalPassThroughEnv en turbo.json),
    // el output va a la raíz del monorepo donde Turbo detection lo busca.
    // En local sigue en apps/web/dist.
    outDir: process.env["VERCEL"] ? "../../dist" : "dist",
    emptyOutDir: false, // false: Vite 6 no puede vaciar dirs fuera del root
    sourcemap: false,
  },
});
