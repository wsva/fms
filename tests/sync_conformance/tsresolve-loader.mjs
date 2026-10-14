// ESM resolve hook for the conformance harness.
//
// The website's Prisma client is generated to `src/generated/prisma` with
// extensionless relative imports (`./enums`, `./internal/class`), and app modules
// import each other through the `@/` tsconfig path alias. Next compiles both away;
// Node's native `--experimental-strip-types` does neither — it only erases types and
// needs every specifier to already point at a real file. This hook bridges the two so
// the harness can drive the REAL app modules (no reimplementation, no bundler):
//   - `@/x`      → <root>/src/x(.ts)
//   - `./x`      → sibling file with the first of .ts/.mts/.js/index.ts that exists
// Anything else (bare package specifiers, explicit paths) falls through untouched.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const SRC = path.join(ROOT, 'src');

function baseAbs(spec, ctx) {
    if (spec.startsWith('@/')) return path.join(SRC, spec.slice(2));
    if (spec.startsWith('.')) {
        const parent = ctx.parentURL ? path.dirname(fileURLToPath(ctx.parentURL)) : ROOT;
        return path.resolve(parent, spec);
    }
    return null;
}

function firstExisting(abs) {
    if (/\.(ts|mts|js|mjs|cjs)$/.test(abs) && existsSync(abs)) return abs;
    for (const cand of [`${abs}.ts`, `${abs}.mts`, `${abs}.js`, path.join(abs, 'index.ts')]) {
        if (existsSync(cand)) return cand;
    }
    return null;
}

export async function resolve(spec, ctx, next) {
    const abs = baseAbs(spec, ctx);
    if (abs) {
        const hit = firstExisting(abs);
        if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return next(spec, ctx);
}
