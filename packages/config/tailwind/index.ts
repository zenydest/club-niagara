import type { Config } from "tailwindcss";

/**
 * Preset de Tailwind compartido para todas las apps Club Niágara.
 * Tema oscuro de boliche: fondo casi negro, verde lima y púrpura.
 */
const niagaraPreset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Colores base de Club Niágara
        background: "#08080F",
        surface: "#0F0F1A",
        "surface-2": "#16162A",
        "surface-3": "#1E1E35",

        // Acento principal: verde lima
        lime: {
          DEFAULT: "#C2FF00",
          50: "#F4FFD6",
          100: "#E8FF99",
          200: "#D5FF4D",
          300: "#C2FF00",
          400: "#A8E000",
          500: "#8DC200",
        },

        // Acento secundario: púrpura
        purple: {
          DEFAULT: "#7B3FFF",
          50: "#EDE4FF",
          100: "#D4BFFF",
          200: "#B08AFF",
          300: "#8C55FF",
          400: "#7B3FFF",
          500: "#6020E0",
          600: "#4D0FCC",
        },

        // Semánticos
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",

        // Texto
        "text-primary": "#F8F8FF",
        "text-secondary": "#9999BB",
        "text-muted": "#55556A",

        // Bordes
        border: "#1E1E35",
        "border-strong": "#2A2A4A",
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
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-lime": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6", color: "#C2FF00" },
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
        "lime-glow": "0 0 20px rgba(194, 255, 0, 0.3)",
        "purple-glow": "0 0 20px rgba(123, 63, 255, 0.3)",
        "card": "0 4px 24px rgba(0, 0, 0, 0.5)",
      },
    },
  },
};

export default niagaraPreset;
