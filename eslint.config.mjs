import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        "src/generated/**",
    ]),
    {
        rules: {
            // Warn on console.log (use console.error/warn for intentional logs)
            "no-console": ["warn", { allow: ["error", "warn"] }],
            // Disallow unsafe type assertions
            "@typescript-eslint/no-explicit-any": "warn",
            // Enforce consistent type imports
            "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
        },
    },
]);

export default eslintConfig;
