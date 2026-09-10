import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A", // near-black navy, headers / primary text
        slate: {
          canvas: "#F5F7FA", // page background
          line: "#E2E8F0", // hairline borders
        },
        entry: "#1D4ED8", // editable-cell blue (matches the lab spreadsheet)
        stage: {
          wastewater: "#B45309", // amber - raw influent
          planted: "#0F766E", // teal - biological treatment
          control: "#334155", // slate - control series
        },
        signal: {
          good: "#0F766E",
          mid: "#B45309",
          low: "#B91C1C",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": "0.6875rem",
      },
    },
  },
  plugins: [],
};

export default config;
