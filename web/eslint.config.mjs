import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext / SST 由来のビルド成果物・設定は Next.js の lint 対象外
    ".open-next/**",
    ".sst/**",
    "sst-env.d.ts",
    "sst.config.ts",
    "open-next.config.ts",
  ]),
]);

export default eslintConfig;
