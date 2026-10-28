import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ["src/generated/**", ".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "coverage/**"] },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
    },
  },
];

export default config;
