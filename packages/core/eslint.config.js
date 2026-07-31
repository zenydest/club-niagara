/**
 * Este paquete no declara `"type": "module"` (su `dist/index.js` es CJS y
 * cambiarlo rompería el build), así que ESLint carga este archivo como
 * CommonJS. El preset compartido sí es ESM, por eso se importa dinámicamente:
 * ESLint 9 acepta que la config exporte una Promise.
 */
module.exports = (async () => {
  const { base } = await import("@niagara/config/eslint");
  return base(__dirname);
})();
