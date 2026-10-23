/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07090c", 900: "#0c1016", 800: "#131922", 700: "#1c2430", 600: "#2a3442", 400: "#7d8a9c", 200: "#c9d2de" },
        sal: { 300: "#7ff2df", 400: "#3ee0c8", 500: "#14c4ab", 600: "#0e9c89" },
        up: "#3ee08a",
        down: "#ff5d73",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
