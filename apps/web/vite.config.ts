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
    // Siempre en apps/web/dist → Turbo lo cachea correctamente (outputs:["dist/**"])
    // Vercel usa outputDirectory:"apps/web/dist" con Root Directory = raíz del monorepo
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
