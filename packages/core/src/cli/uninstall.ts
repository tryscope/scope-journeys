import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { NODE_PACKAGE } from "./mount-file.js";
import { INSTRUMENTATION_EXPORT, unwrapProxySource } from "./proxy-file.js";
import { readLock, LOCK_DIR } from "./project.js";
import type { Exec } from "./vercel.js";

export interface UninstallReport {
  ok: boolean;
  form: "next" | "cloudflare" | "node" | "envoy" | null;
  removed: string[];
  restored: string[];
  manual: string[];
  next_step: string;
}

const removeCommand = (root: string, dependency: string): [string, string[]] => {
  const name = dependency.replace(/@[^@]*$/, "");
  if (existsSync(join(root, "pnpm-lock.yaml"))) return ["pnpm", ["remove", name]];
  if (existsSync(join(root, "yarn.lock"))) return ["yarn", ["remove", name]];
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return ["bun", ["remove", name]];
  return ["npm", ["uninstall", name]];
};

/**
 * `journeys uninstall` (plan J2.1 step 7): reverses every write `init` recorded in its lock and
 * never calls the API; the install stays Scope's to show as stale (architecture §16.3).
 */
export async function uninstallNext(root: string, exec: Exec): Promise<UninstallReport> {
  const lock = readLock(root);
  if (!lock) return { ok: false, form: null, removed: [], restored: [], manual: [], next_step: "nothing to undo: no .journeys/init.lock here (was `journeys init` run in this directory?)" };
  const report: UninstallReport = { ok: true, form: lock.form, removed: [], restored: [], manual: [], next_step: "" };
  if (lock.form !== "next") return { ...report, ok: false, next_step: `this lock is ${lock.form === "node" ? "a Node" : lock.form === "envoy" ? "an Envoy" : "a Cloudflare"} install: run \`journeys uninstall --${lock.form}\`` };
  if (lock.proxy_file) {
    const path = join(root, lock.proxy_file);
    if (lock.proxy_created && existsSync(path)) {
      unlinkSync(path);
      report.removed.push(lock.proxy_file);
    } else if (lock.proxy_previous && existsSync(path)) {
      writeFileSync(path, unwrapProxySource(readFileSync(path, "utf8"), lock.proxy_previous));
      report.restored.push(lock.proxy_file);
    } else if (existsSync(path)) report.manual.push(`${lock.proxy_file}: remove the withJourneys import and export by hand (the lock does not say how it was wrapped)`);
  }
  const instrumentation = join(root, lock.proxy_file?.startsWith("src/") ? "src/instrumentation.ts" : "instrumentation.ts");
  if (lock.instrumentation_created && existsSync(instrumentation)) {
    unlinkSync(instrumentation);
    report.removed.push(instrumentation.slice(root.length + 1));
  } else if (lock.instrumentation_added_export && existsSync(instrumentation)) {
    writeFileSync(instrumentation, readFileSync(instrumentation, "utf8").replace(`\n\n${INSTRUMENTATION_EXPORT}\n`, "\n").replace(`${INSTRUMENTATION_EXPORT}\n`, ""));
    report.restored.push(instrumentation.slice(root.length + 1));
  }
  if (lock.dependency) {
    const [command, args] = removeCommand(root, lock.dependency);
    const result = await exec(command, args, { cwd: root }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
    if (result.code === 0) report.removed.push(lock.dependency.replace(/@[^@]*$/, ""));
    else report.manual.push(`${command} ${args.join(" ")} (the dependency was not removed)`);
  }
  rmSync(join(root, LOCK_DIR), { recursive: true, force: true });
  report.removed.push(`${LOCK_DIR}/`);
  report.manual.push("vercel env rm JOURNEYS_INSTALL_ID production preview development", "vercel env rm JOURNEYS_SALT production preview development", "vercel env rm JOURNEYS_INSTALL_KEY production preview development   # if the key form was used", "remove the JOURNEYS_* lines from .env.local");
  report.next_step = "the product is as it was; the install stays in Scope and shows as stale";
  return report;
}

/** `journeys uninstall --node` (plan J5.1): the entry file as it was before the mount, the dependency and the lock gone; never calls the API. */
export async function uninstallNode(root: string, exec: Exec): Promise<UninstallReport> {
  const lock = readLock(root);
  if (!lock) return { ok: false, form: null, removed: [], restored: [], manual: [], next_step: "nothing to undo: no .journeys/init.lock here (was `journeys init --node` run in this directory?)" };
  const report: UninstallReport = { ok: true, form: lock.form, removed: [], restored: [], manual: [], next_step: "" };
  if (lock.form !== "node") return { ...report, ok: false, next_step: `this lock is ${lock.form === "next" ? "a Next" : lock.form === "envoy" ? "an Envoy" : "a Cloudflare"} install: run \`journeys uninstall${lock.form === "next" ? "" : ` --${lock.form}`}\`` };
  if (lock.mount_file) {
    const path = join(root, lock.mount_file);
    if (!existsSync(path)) report.manual.push(`${lock.mount_file} is gone; nothing to restore there`);
    else if (typeof lock.mount_previous === "string" && readFileSync(path, "utf8").includes(NODE_PACKAGE)) {
      writeFileSync(path, lock.mount_previous);
      report.restored.push(lock.mount_file);
    } else if (readFileSync(path, "utf8").includes(NODE_PACKAGE)) report.manual.push(`${lock.mount_file}: remove the ${NODE_PACKAGE} import and the mount line by hand (the lock holds no previous source)`);
  }
  if (lock.dependency) {
    const [command, args] = removeCommand(root, lock.dependency);
    const result = await exec(command, args, { cwd: root }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
    if (result.code === 0) report.removed.push(lock.dependency.replace(/@[^@]*$/, ""));
    else report.manual.push(`${command} ${args.join(" ")} (the dependency was not removed)`);
  }
  rmSync(join(root, LOCK_DIR), { recursive: true, force: true });
  report.removed.push(`${LOCK_DIR}/`);
  report.manual.push("remove the JOURNEYS_* lines from .env.local and from the deployment's environment");
  report.next_step = "the product is as it was; the install stays in Scope and shows as stale";
  return report;
}

/** `journeys uninstall --envoy` (plan J5.2): the envoy.yaml as it was before the fragment, the written fragments and the lock gone; never calls the API. */
export async function uninstallEnvoy(root: string): Promise<UninstallReport> {
  const lock = readLock(root);
  if (!lock) return { ok: false, form: null, removed: [], restored: [], manual: [], next_step: "nothing to undo: no .journeys/init.lock here (was `journeys init --envoy` run in this directory?)" };
  const report: UninstallReport = { ok: true, form: lock.form, removed: [], restored: [], manual: [], next_step: "" };
  if (lock.form !== "envoy") return { ...report, ok: false, next_step: `this lock is ${lock.form === "next" ? "a Next" : lock.form === "node" ? "a Node" : "a Cloudflare"} install: run \`journeys uninstall${lock.form === "next" ? "" : ` --${lock.form}`}\`` };
  if (lock.mount_file) {
    const path = join(root, lock.mount_file);
    if (!existsSync(path)) report.manual.push(`${lock.mount_file} is gone; nothing to restore there`);
    else if (typeof lock.mount_previous === "string" && readFileSync(path, "utf8").includes("envoy.filters.http.ext_proc")) {
      writeFileSync(path, lock.mount_previous);
      report.restored.push(lock.mount_file);
    } else if (readFileSync(path, "utf8").includes("envoy.filters.http.ext_proc")) report.manual.push(`${lock.mount_file}: remove the ext_proc filter and the journeys_ext_proc cluster by hand (the lock holds no previous source)`);
  }
  for (const name of ["journeys/envoy.journeys.yaml", "journeys/istio.journeys.yaml"]) {
    if (existsSync(join(root, name))) {
      unlinkSync(join(root, name));
      report.removed.push(name);
    }
  }
  rmSync(join(root, LOCK_DIR), { recursive: true, force: true });
  report.removed.push(`${LOCK_DIR}/`);
  report.manual.push("reload Envoy without the filter; stop the processor; remove the JOURNEYS_* lines from .env.local and from its deployment");
  report.next_step = "the product is as it was; the install stays in Scope and shows as stale";
  return report;
}
