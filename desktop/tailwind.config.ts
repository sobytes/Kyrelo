import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        panel: "#11141b",
        panel2: "#161a23",
        line: "#1f2430",
        line2: "#2a3142",
        accent: "#7c5cff",
        live: "#10b981",
      },
      animation: {
        "live-pulse": "live-pulse 2.2s ease-out infinite",
        "fade-in": "fade-in 200ms ease-out",
      },
      keyframes: {
        "live-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(16, 185, 129, 0.55)",
          },
          "70%": {
            boxShadow: "0 0 0 9px rgba(16, 185, 129, 0)",
          },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
