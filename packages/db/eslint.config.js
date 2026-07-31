/**
 * Paquete CommonJS (ver nota en packages/core/eslint.config.js): el preset
 * compartido es ESM, así que se importa dinámicamente y se exporta la Promise.
 *
 * `prisma/` queda fuera del lint: el tsconfig tiene `rootDir: "./src"`, así que
 * incluir seed.ts en el proyecto de TypeScript daría TS6059. Las reglas con
 * type-checking necesitan que el archivo esté en el proyecto, y no vale la pena
 * un segundo tsconfig solo para un script de seed.
 */
module.exports = (async () => {
  const { node } = await import("@niagara/config/eslint");
  return [...node(__dirname), { ignores: ["prisma/**"] }];
})();
