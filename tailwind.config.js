/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05100f",
          900: "#0a1817",
          800: "#0f2422",
          700: "#173430",
          600: "#204a44",
        },
        aqua: {
          400: "#5eead4",
          500: "#2dd4bf",
          600: "#14b8a6",
          700: "#0f9488",
        },
        amber: {
          400: "#fbbf24",
          500: "#f59e0b",
        },
        coral: {
          400: "#fb7185",
          500: "#f43f5e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(45, 212, 191, 0.15), 0 8px 24px -8px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};
