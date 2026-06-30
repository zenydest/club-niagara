import type { Config } from "tailwindcss";
import niagaraPreset from "@niagara/config/tailwind";

const config: Config = {
  presets: [niagaraPreset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
};

export default config;
