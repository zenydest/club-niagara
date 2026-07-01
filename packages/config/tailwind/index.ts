import type { Config } from "tailwindcss";

/**
 * Preset de Tailwind compartido para todas las apps Club Niágara.
 * Paleta extraída del logo: negro profundo + azul eléctrico + púrpura + magenta.
 * Ring de neón: #1E50FF → #8B3DFF → #CC0099
 */
const niagaraPreset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Colores base — negro profundo con tinte azul
        background: "#06060F",
        surface: "#0C0C1A",
        "surface-2": "#111128",
        "surface-3": "#171735",

        // Acento principal: azul eléctrico (lado izquierdo del ring del logo)
        lime: {
          DEFAULT: "#1E50FF",
          50: "#E6ECFF",
          100: "#BFCEFF",
          200: "#8AAAFF",
          300: "#4D7AFF",
          400: "#1E50FF",
          500: "#0035E0",
          600: "#0025B0",
        },

        // Acento secundario: púrpura vivido (centro del ring)
        purple: {
          DEFAULT: "#8B3DFF",
          50: "#F0E8FF",
          100: "#D9C4FF",
          200: "#BC91FF",
          300: "#A060FF",
          400: "#8B3DFF",
          500: "#6E20E0",
          600: "#5510C0",
        },

        // Acento terciario: magenta / hot pink (lado derecho del ring)
        magenta: {
          DEFAULT: "#CC0099",
          50: "#FFE0F5",
          100: "#FFB3E6",
          200: "#FF66CC",
          300: "#FF1AB3",
          400: "#CC0099",
          500: "#990073",
          600: "#66004D",
        },

        // Semánticos
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",

        // Texto
        "text-primary": "#F0F0FF",
        "text-secondary": "#8888AA",
        "text-muted": "#444460",

        // Bordes
        border: "#171735",
        "border-strong": "#222248",
      },
      backgroundImage: {
        // Gradiente del ring del logo
        "neon-ring": "linear-gradient(135deg, #1E50FF 0%, #8B3DFF 50%, #CC0099 100%)",
        "neon-ring-h": "linear-gradient(90deg, #1E50FF 0%, #8B3DFF 50%, #CC0099 100%)",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        // KPIs grandes, legibles en penumbra
        "kpi-xl": ["4rem", { lineHeight: "1", fontWeight: "900" }],
        "kpi-lg": ["3rem", { lineHeight: "1", fontWeight: "800" }],
        "kpi-md": ["2rem", { lineHeight: "1.1", fontWeight: "700" }],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "pulse-lime": "pulse-lime 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "neon-pulse": "neon-pulse 3s ease-in-out infinite",
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-lime": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "neon-pulse": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.8", filter: "brightness(1.3)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        "lime-glow": "0 0 24px rgba(30, 80, 255, 0.4)",
        "purple-glow": "0 0 24px rgba(139, 61, 255, 0.4)",
        "magenta-glow": "0 0 24px rgba(204, 0, 153, 0.4)",
        "neon-glow": "0 0 30px rgba(30, 80, 255, 0.3), 0 0 60px rgba(139, 61, 255, 0.2), 0 0 90px rgba(204, 0, 153, 0.15)",
        "card": "0 4px 24px rgba(0, 0, 0, 0.6)",
      },
    },
  },
};

export default niagaraPreset;
