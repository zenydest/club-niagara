/**
 * Preset de ESLint compartido de Club Niágara — flat config (ESLint 9).
 *
 * Exporta tres presets:
 *   base   — TS con type-checking, sirve para cualquier paquete
 *   node   — base + globals de Node (API, scripts)
 *   react  — base + globals de browser + reglas de hooks (web, pos)
 *
 * Uso desde un paquete:
 *   // eslint.config.js
 *   import { react } from "@niagara/config/eslint";
 *   export default react(import.meta.dirname);
 *
 * El parámetro es el directorio raíz del paquete: typescript-eslint lo necesita
 * para encontrar el tsconfig y poder aplicar las reglas que requieren tipos.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/** Archivos y carpetas que nunca se lintean */
const IGNORES = [
  "**/dist/**",
  "**/build/**",
  "**/.turbo/**",
  "**/node_modules/**",
  "**/coverage/**",
  "**/*.config.js",
  "**/*.config.ts",
];

/** Reglas comunes a todos los paquetes */
const REGLAS_BASE = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  "@typescript-eslint/no-non-null-assertion": "error",

  // Promesas sin await son la fuente de bugs más común en este código
  // (sync offline, llamadas a la API), así que se marcan.
  "@typescript-eslint/no-floating-promises": "error",

  // Apagada a propósito: Fastify exige que los plugins y handlers sean async
  // por contrato de tipos (`FastifyPluginAsync`), aunque no tengan ningún
  // await adentro. La regla marcaba ~18 falsos positivos en apps/api.
  "@typescript-eslint/require-await": "off",

  // Los `catch (err)` sin usar se permiten si empiezan con guion bajo,
  // igual que los argumentos.
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],

  // El repo accede a variables de entorno con corchetes
  // (`process.env["PORT"]`, `import.meta.env["VITE_API_URL"]`). Es el estilo
  // correcto para index signatures y lo exige `noPropertyAccessFromIndexSignature`
  // si algún día se activa, así que no se marca como error.
  "dot-notation": "off",
  "@typescript-eslint/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],

  "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  "prefer-const": "error",
  "no-var": "error",
};

/**
 * Preset base: TypeScript con reglas que usan información de tipos.
 * @param {string} tsconfigRootDir Directorio del paquete (import.meta.dirname)
 */
export function base(tsconfigRootDir) {
  return tseslint.config(
    { ignores: IGNORES },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: REGLAS_BASE,
    }
  );
}

/** Preset para paquetes que corren en Node (API, scripts, tooling) */
export function node(tsconfigRootDir) {
  return tseslint.config(...base(tsconfigRootDir), {
    languageOptions: {
      globals: { ...globals.node },
    },
  });
}

/** Preset para apps de React (web, pos) */
export function react(tsconfigRootDir) {
  return tseslint.config(
    ...base(tsconfigRootDir),
    {
      languageOptions: {
        globals: { ...globals.browser },
      },
      plugins: { "react-hooks": reactHooks },
      rules: {
        ...reactHooks.configs.recommended.rules,
      },
    },
    {
      // React 18 con el JSX transform nuevo: importar React no es obligatorio,
      // pero varios archivos lo hacen. No es un error, solo ruido.
      files: ["**/*.tsx"],
      rules: {
        "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      },
    }
  );
}

export default base;
