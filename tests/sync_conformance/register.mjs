// Registers the TS-resolve hook before any app module loads. Run as:
//   node --experimental-strip-types --import ./tests/sync_conformance/register.mjs \
//        --test tests/sync_conformance
import { register } from 'node:module';
register('./tsresolve-loader.mjs', import.meta.url);
