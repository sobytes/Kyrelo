import type { Config } from "tailwindcss";
import tokens from "../contracts/design-tokens.json";

// The design system (contracts/design-tokens.json, shared with the website
// and the iPhone app). Colours, radii and shadows REPLACE Tailwind's
// defaults rather than extend them, so only the tokens exist: a stray
// zinc-500 or rounded-2xl does nothing instead of drifting from the system.
const c = tokens.color;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      canvas: c.canvas,
      surface: c.surface,
      fg: c.fg,
      muted: c.muted,
      line: c.line,
      primary: { DEFAULT: c.primary, hover: c.primaryHover },
      accent: c.accent,
      success: c.success,
      warning: c.warning,
      error: c.error,
    },
    borderRadius: {
      none: "0",
      sm: `${tokens.radius.sm}px`,
      DEFAULT: `${tokens.radius.sm}px`,
      md: `${tokens.radius.md}px`,
      lg: `${tokens.radius.lg}px`,
      // Status dots only; anything bigger stays within 12px.
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      // Borders and contrast first; shadows only to lift a dialog off the page.
      sm: "0 1px 2px rgba(23, 23, 23, 0.06)",
      md: "0 12px 32px rgba(23, 23, 23, 0.12)",
    },
    fontFamily: {
      sans: ["var(--font-sans)", tokens.font.sans, "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", tokens.font.mono, "ui-monospace", "monospace"],
    },
    extend: {
      animation: {
        "fade-in": "fade-in 150ms ease-out",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
