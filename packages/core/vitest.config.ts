import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests unitarios de schemas/constantes — sin DOM, corren en Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
