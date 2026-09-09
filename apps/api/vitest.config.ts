import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests de rutas con Prisma mockeado — sin DOM, corren en Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
