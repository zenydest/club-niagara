/**
 * Paquete CommonJS (ver nota en packages/core/eslint.config.js): el preset
 * compartido es ESM, así que se importa dinámicamente y se exporta la Promise.
 */
module.exports = (async () => {
  const { react } = await import("@niagara/config/eslint");
  return react(__dirname);
})();
