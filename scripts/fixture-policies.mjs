// The variants of the toy policy the fixtures run under, derived from `policy.json` so they never
// drift from it: `policy.dryrun.json` (every rule dry run) and `policy.gate-closed.json` (the gate
// closed on error, with an acknowledgement that asks for a value the gate cannot fill). Committed;
// `test/node/fixture-policies.test.ts` fails when they are stale. `--write` regenerates them.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SYNTHETIC = new URL("../fixtures/synthetic/", import.meta.url).pathname;

export function variants() {
  const base = JSON.parse(readFileSync(join(SYNTHETIC, "policy.json"), "utf8"));
  const dryrun = structuredClone(base);
  dryrun.about = `${base.about} Every rule dry run: computed, recorded, nothing changed on the wire.`;
  for (const rule of dryrun.rules) rule.mode = "dry_run";
  const closed = structuredClone(base);
  closed.about = `${base.about} The gate is closed on error and its acknowledgement asks for {token}, which a gate cannot fill, so the rule throws on every declaration.`;
  for (const rule of closed.rules) {
    if (rule.kind !== "gate") continue;
    rule.on_error = "closed";
    rule.acknowledgement = `${rule.acknowledgement} Token {token}.`;
  }
  const referenceCode = structuredClone(base);
  referenceCode.about = `${base.about} The reference parameters are ref and code, the lab's list, so a device user code travels in a reference parameter.`;
  referenceCode.headers = { ...base.headers, reference: ["ref", "code"] };
  const assertion = structuredClone(base);
  assertion.about = `${base.about} The assertion is on: every forwarded request carries x-scope-assertion and x-scope-agent.`;
  assertion.assertion = { enabled: true };
  const unknownRule = structuredClone(base);
  unknownRule.about = `${base.about} A section and a rule kind this sensor version does not know: the section is ignored and named in the notices, the rule runs dry and records skipped.`;
  unknownRule.experiments = { banner: { copy: "Try the new API", until: "2027-01-01" } };
  unknownRule.rules = [...base.rules, { id: "future", kind: "banner", mode: "live", environments: ["production", "preview", "development"], copy: "Try the new API" }];
  return { "policy.dryrun.json": dryrun, "policy.gate-closed.json": closed, "policy.reference-code.json": referenceCode, "policy.assertion.json": assertion, "policy.unknown-rule.json": unknownRule };
}

export const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const write = process.argv.includes("--write");
  let stale = 0;
  for (const [name, document] of Object.entries(variants())) {
    const path = join(SYNTHETIC, name);
    const text = serialize(document);
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = null;
    }
    if (current === text) continue;
    stale += 1;
    if (write) writeFileSync(path, text);
    console.log(`${write ? "wrote" : "stale"} fixtures/synthetic/${name}`);
  }
  if (!write && stale) process.exit(1);
  if (!stale) console.log("fixture policies current");
}
