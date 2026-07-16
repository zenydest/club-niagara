/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Paleta NOXA
        bg:     "#08080F",
        lima:   "#C2FF00",
        purple: "#7B3FFF",
        surface: "#12121C",
        border:  "#1E1E2E",
        muted:   "#6B6B8A",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
