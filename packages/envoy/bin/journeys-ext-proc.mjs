#!/usr/bin/env node
// The processor as a binary: the install's variables from the environment (and .env.local in the
// working directory), the listen address from JOURNEYS_EXT_PROC_LISTEN or --listen, SIGTERM drains.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { serveExtProc } from "../dist/index.js";

const { values } = parseArgs({ args: process.argv.slice(2), options: { listen: { type: "string" }, help: { type: "boolean" } }, strict: false });
if (values.help) {
  process.stdout.write("journeys-ext-proc [--listen 0.0.0.0:9000]\n  JOURNEYS_INSTALL_ID, JOURNEYS_INSTALL_KEY, JOURNEYS_SALT, JOURNEYS_API_URL, JOURNEYS_NAME, JOURNEYS_EXT_PROC_LISTEN from the environment or .env.local\n");
  process.exit(0);
}
const env = { ...process.env };
const local = join(process.cwd(), ".env.local");
if (existsSync(local)) {
  for (const raw of readFileSync(local, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
}
const running = await serveExtProc({ env, listen: typeof values.listen === "string" ? values.listen : undefined, signals: true });
process.stdout.write(`journeys-ext-proc: listening on ${running.address}${env.JOURNEYS_INSTALL_ID ? ` as ${env.JOURNEYS_INSTALL_ID}` : " with no install (forward-only default; run journeys init --envoy)"}\n`);
await running.closed;
