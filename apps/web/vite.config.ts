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
    // En Vercel, output va a la raíz del monorepo donde Turbo detection lo busca
    outDir: process.env["VERCEL"] ? "../../dist" : "dist",
    emptyOutDir: true,
    sourcemap: false, // Desactivado en prod para reducir tamaño
  },
});
