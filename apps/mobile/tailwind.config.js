/** @type {import('tailwindcss').Config} */

/**
 * Paleta Club Niágara — misma que packages/config/tailwind (web y POS).
 * Extraída del logo: negro profundo + azul eléctrico + púrpura + magenta.
 * Ring de neón: #1E50FF → #8B3DFF → #CC0099
 *
 * No se puede importar el preset compartido acá: es TypeScript y usa el plugin
 * de Tailwind para web, mientras que NativeWind necesita su propio preset. Por
 * eso los valores están duplicados — si cambian en el preset, actualizar acá.
 */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Base — negro profundo con tinte azul
        bg:        "#06060F",
        surface:   "#0C0C1A",
        "surface-2": "#111128",
        border:    "#1E1E2E",

        // Acentos del logo
        azul:      "#1E50FF",
        purple:    "#8B3DFF",
        magenta:   "#CC0099",

        // `lima` se mantiene como alias del acento principal para no romper las
        // clases que ya lo usan en las pantallas.
        lima:      "#1E50FF",

        // Texto
        white:     "#F0F0FF",
        muted:     "#8888AA",
        "muted-2": "#444460",

        // Semánticos
        success:   "#22C55E",
        warning:   "#F59E0B",
        danger:    "#EF4444",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
