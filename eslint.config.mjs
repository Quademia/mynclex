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
    // Claude Design handoff bundles. These are reference artefacts kept
    // verbatim so a future slice can copy from the original — a vendor
    // prototype runtime and read-only snapshots of our own stylesheets.
    // None of it ships, none of it is imported, and linting it only ever
    // reports on code we must not "fix" without breaking the reference.
    "docs/product-plan/design-handoff/**",
    // Claude Code's own directory — skill definitions and the plain Node
    // CommonJS helper scripts behind the question-transcription skill.
    // Tooling, not application code: never imported, never bundled, and
    // run by `node`, not by Next. The app's module rules (no `require`)
    // describe a bundler these files never meet.
    ".claude/**",
  ]),
]);

export default eslintConfig;
