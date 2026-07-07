/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "anac-navy": "#1b2a5e",
        "anac-blue": "#2b4dae",
        "anac-sky": "#4a90d9",
        "anac-white": "#ffffff",
        "anac-gray": "#f4f6fa",
        "anac-border": "#d1d9e6",
        "anac-text": "#1a2340",
        "anac-muted": "#6b7a99",
        "anac-success": "#16a34a",
        "anac-warning": "#d97706",
        "anac-danger": "#dc2626",
        "anac-info": "#0891b2",
      },
    },
  },
  plugins: [],
};
