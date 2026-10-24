import type { Config } from "tailwindcss";

/**
 * Design tokens from docs/design/*.html (see .kiro/steering/design.md).
 * Tokens, not raw hex, so a palette change is one edit here.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1B1E24",
        muted: "#5C6370",
        graphite: "#3D434E",
        line: "#E3E6EB",
        bench: "#F5F6F8",
        pen: {
          DEFAULT: "#2142C6",
          hover: "#1A35A0",
        },
        done: "#1E7A4C",
        needed: {
          DEFAULT: "#8F5200",
          bg: "#FFF5E1",
        },
      },
      borderRadius: {
        control: "6px",
        panel: "8px",
      },
      fontFamily: {
        sans: ["var(--font-schibsted)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
