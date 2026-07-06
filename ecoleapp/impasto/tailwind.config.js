/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  // Cohabitation avec le design system CSS existant : pas de reset global.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ember: { DEFAULT: "var(--ember1)", 2: "var(--ember2)" },
        navy: { DEFAULT: "var(--navy)", dark: "var(--navy-dark)", 2: "var(--navy-2)" },
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface2)", 3: "var(--surface3)" },
        ink: "var(--text)",
        muted: "var(--muted)",
        dim: "var(--dim)",
        line: "var(--border)",
        "line-soft": "var(--border-soft)",
        bg: { DEFAULT: "var(--bg)", 2: "var(--bg2)" },
        green: "var(--green)",
        blue: "var(--blue)",
      },
      fontFamily: {
        display: ["var(--font-d)"],
        sans: ["var(--font-b)"],
        mono: ["var(--font-m)"],
      },
      borderRadius: { brand: "var(--r)", brandsm: "var(--r-sm)" },
      boxShadow: { glow: "var(--shadow-glow)" },
      backgroundImage: { ember: "var(--grad-ember)" },
    },
  },
  plugins: [],
};
