const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// Raíz del monorepo
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: que Metro pueda resolver paquetes desde la raíz.
// Se agrega a los watchFolders por defecto de Expo en vez de reemplazarlos.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/**
 * Una sola copia de React y React Native en el bundle.
 *
 * El monorepo tiene dos versiones conviviendo: web, pos y ui usan React 18.3.1,
 * y mobile usa React 19.1.0. Como la raíz del workspace está en
 * `nodeModulesPaths`, Metro podía resolver la 18 para algunos módulos y la 19
 * para otros.
 *
 * Eso rompe la app al arrancar: React 19 cambió el símbolo interno de los
 * elementos (`react.transitional.element`), así que no reconoce los elementos
 * creados por React 18 y los reporta como
 *   "Objects are not valid as a React child (found: object with keys
 *    {$$typeof, type, key, ref, props, _owner})"
 * El `_owner` de ese mensaje es justamente un campo de los elementos de React 18.
 *
 * Forzar la resolución a las copias de apps/mobile elimina la ambigüedad.
 */
const SINGLETONS = new Set(["react", "react-dom", "react-native"]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.has(moduleName)) {
    return context.resolveRequest(
      {
        ...context,
        // Resolver siempre como si el import saliera de apps/mobile
        originModulePath: path.join(projectRoot, "package.json"),
      },
      moduleName,
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
