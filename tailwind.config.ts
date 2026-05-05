import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "rgb(var(--color-accent-primary) / <alpha-value>)",
          secondary: "rgb(var(--color-accent-secondary) / <alpha-value>)",
          dark: "rgb(var(--color-accent-dark) / <alpha-value>)",
        },
        surface: {
          base: "rgb(var(--color-bg-base) / <alpha-value>)",
          card: "rgb(var(--color-bg-surface) / <alpha-value>)",
          hover: "rgb(var(--color-bg-hover) / <alpha-value>)",
        },
        "txt-primary": "rgb(var(--color-text-primary) / <alpha-value>)",
        "txt-secondary": "rgb(var(--color-text-secondary) / <alpha-value>)",
        "txt-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "var(--radius-base)",
        sm: "var(--radius-sm)",
        md: "var(--radius-base)",
        lg: "var(--radius-base)",
        xl: "calc(var(--radius-base) + 0.25rem)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
