// The deployable entry: `journeys init --cloudflare` writes a `src/worker.ts` that re-exports this,
// and wrangler bundles it with the bindings of wrangler.toml.
import { createHandler } from "./index.js";

export default createHandler();
