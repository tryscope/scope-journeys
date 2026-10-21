import { parseArgs } from "node:util";

import { doctor, doctorLocal, renderDoctorReport } from "./doctor.js";
import { runInit, runUninstall } from "./init.js";
import { runRotate } from "./rotate.js";
import { runRotateSalt } from "./rotate-salt.js";
import { emit, usage, wantsJson } from "./output.js";
import { validateFile } from "./policy.js";
import { runProxy } from "./proxy.js";
import { versionReport } from "./version.js";

/**
 * The bin: the commands that need no control plane. Exit codes: 0 done; 1 a
 * finding (an invalid policy, a probe that did not become a page); 2 usage; 5 the app or the API
 * unreachable. Every non-zero exit prints the one thing to do.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const json = wantsJson(argv);
  const [command, sub, ...rest] = argv.filter((a) => a !== "--json");
  if (command === "version") {
    emit(versionReport(), { json });
    return 0;
  }
  if (command === "init") return runInit(argv.slice(1), undefined, json);
  if (command === "uninstall") return runUninstall(argv.slice(1), undefined, json);
  if (command === "rotate-assertion-key") return runRotate(argv.slice(1), undefined, json);
  if (command === "rotate-salt") return runRotateSalt(argv.slice(1), undefined, json);
  if (command === "proxy") return runProxy(argv.slice(1), json);
  if (command === "policy" && sub === "validate") {
    const file = rest[0];
    if (!file) {
      process.stderr.write("journeys policy validate <file>\n");
      return 2;
    }
    const report = validateFile(file);
    emit(report, { json });
    if (!json) {
      for (const e of report.errors) process.stdout.write(`${e.path}: ${e.message}\n`);
      for (const w of report.warnings) process.stdout.write(`warning ${w.path}: ${w.message}\n`);
    }
    return report.ok ? 0 : 1;
  }
  if (command === "doctor") {
    const { values } = parseArgs({ args: [sub, ...rest].filter((a): a is string => typeof a === "string"), options: { local: { type: "boolean" }, policy: { type: "string" }, url: { type: "string" }, path: { type: "string" }, raw: { type: "boolean" }, install: { type: "string" }, token: { type: "string" }, "api-url": { type: "string" }, timeout: { type: "string" } }, strict: false });
    if (!values.local) {
      const report = await doctor(
        { cwd: process.cwd(), url: typeof values.url === "string" ? values.url : null, install: typeof values.install === "string" ? values.install : null, token: typeof values.token === "string" ? values.token : null, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null, timeoutSeconds: typeof values.timeout === "string" && Number(values.timeout) > 0 ? Number(values.timeout) : 60 },
        { fetch: (input, init) => fetch(input, init), env: process.env as Record<string, string | undefined>, now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)) },
      );
      if (json) emit(report, { json: true });
      else for (const line of renderDoctorReport(report)) process.stdout.write(`${line}\n`);
      return report.exit_code;
    }
    if (typeof values.policy !== "string" || typeof values.url !== "string") {
      process.stderr.write("journeys doctor --local --policy <file> --url <base url> [--path /docs/quickstart]\n");
      return 2;
    }
    try {
      const report = await doctorLocal({ policy: values.policy, url: values.url, path: typeof values.path === "string" ? values.path : undefined, raw: values.raw === true });
      emit(report, { json });
      if (!json) {
        process.stdout.write(report.ok ? `ok: ${report.route} page, reference ${report.reference_minted ?? "not placed (no live inject rule matched)"}\n` : `${report.reasons.join("\n")}\n`);
      }
      return report.ok ? 0 : 1;
    } catch (error) {
      process.stderr.write(`journeys doctor: ${error instanceof Error ? error.message : String(error)}\nis the app listening at ${values.url}?\n`);
      return 5;
    }
  }
  process.stderr.write(`${usage()}\n`);
  return 2;
}
