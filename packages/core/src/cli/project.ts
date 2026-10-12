import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What `init` learns about a Next project before it asks anything (plan J2.1 step 1). */
export interface NextProject {
  root: string;
  nextMajor: number | null;
  nextRange: string;
  configFile: string | null;
  /** The proxy file, relative to the root: proxy.ts (Next 16) or middleware.ts (Next 15), under src/ when src/app exists. */
  proxyFile: string;
  proxyExists: boolean;
  instrumentationFile: string;
  instrumentationExists: boolean;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  envLocalIgnored: boolean;
}

export type Detection = { ok: true; project: NextProject } | { ok: false; reason: "not_next" | "next_too_old"; detail: string };

const majorOf = (range: string): number | null => {
  const m = /(\d+)(?:\.\d+)*/.exec(range);
  return m ? Number(m[1]) : null;
};

/** Whether `.env.local` is ignored by the root `.gitignore` (the common spellings). */
export function envLocalIgnored(root: string): boolean {
  const file = join(root, ".gitignore");
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim());
  return lines.some((l) => [".env.local", ".env*.local", ".env.*", ".env*", "*.local", ".env.local*"].includes(l) || l === "/.env.local");
}

export function detectNext(root: string): Detection {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, reason: "not_next", detail: "no package.json here" };
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
  } catch {
    return { ok: false, reason: "not_next", detail: "package.json is not valid JSON" };
  }
  const range = pkg.dependencies?.next ?? pkg.devDependencies?.next;
  if (!range) return { ok: false, reason: "not_next", detail: "package.json does not depend on next" };
  let major: number | null = null;
  const installed = join(root, "node_modules", "next", "package.json");
  if (existsSync(installed)) {
    try {
      major = majorOf((JSON.parse(readFileSync(installed, "utf8")) as { version?: string }).version ?? "");
    } catch {
      major = null;
    }
  }
  if (major === null) major = majorOf(range);
  if (major !== null && major < 15) return { ok: false, reason: "next_too_old", detail: `next ${range} is below 15` };
  const configFile = ["next.config.ts", "next.config.mjs", "next.config.js"].find((name) => existsSync(join(root, name))) ?? null;
  const underSrc = existsSync(join(root, "src", "app"));
  const base = major === 15 ? "middleware.ts" : "proxy.ts";
  const proxyFile = underSrc ? `src/${base}` : base;
  const instrumentationFile = underSrc ? "src/instrumentation.ts" : "instrumentation.ts";
  const packageManager = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb")) ? "bun" : "npm";
  return {
    ok: true,
    project: { root, nextMajor: major, nextRange: range, configFile, proxyFile, proxyExists: existsSync(join(root, proxyFile)), instrumentationFile, instrumentationExists: existsSync(join(root, instrumentationFile)), packageManager, envLocalIgnored: envLocalIgnored(root) },
  };
}

/** A dotenv file as a map: `KEY=value`, quotes stripped, comments and blanks skipped. */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** Sets the given keys in a dotenv file, keeping every other line as it was. */
export function upsertEnvFile(path: string, values: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.length ? existing.replace(/\n$/, "").split("\n") : [];
  const pending = new Map(Object.entries(values));
  const out = lines.map((line) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m && m[1] && pending.has(m[1])) {
      const value = pending.get(m[1]) ?? "";
      pending.delete(m[1]);
      return `${m[1]}=${value}`;
    }
    return line;
  });
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  writeFileSync(path, `${out.join("\n")}\n`);
}

/** The per-project lock `init` keeps: the idempotency key of its one API call, and what it wrote, so `uninstall` can reverse it. */
export interface InitLock {
  idempotency_key: string;
  created_at: string;
  form: "next" | "cloudflare" | "node" | "envoy";
  install_id: string | null;
  /** The documentation host the person named at init (`same` means the product host), so doctor can name it first when it is not fronted. */
  docs_host?: string | null;
  proxy_file: string | null;
  proxy_created: boolean;
  proxy_previous: string | null;
  instrumentation_created: boolean;
  instrumentation_added_export: boolean;
  dependency: string | null;
  /** The Node form (plan J5.1): the entry file the mount was written into, and its source before the write, restored by `uninstall`; the Envoy form (J5.2): the envoy.yaml the fragment was applied to, likewise. */
  mount_file?: string | null;
  mount_previous?: string | null;
}

export type NodeFramework = "express" | "fastify" | "hono";

/** What `init --node` learns about a Node project before it asks anything (plan J5.1 step 5). */
export interface NodeProject {
  root: string;
  framework: NodeFramework;
  /** Every framework the project depends on, when more than one; the first in express, fastify, hono order is mounted. */
  frameworks: NodeFramework[];
  /** The entry file the mount goes into (`--entry`, else package.json's main, else the file a start or dev script runs), or null when none was found. */
  entry: string | null;
  moduleStyle: "esm" | "cjs";
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  envLocalIgnored: boolean;
}

export type NodeDetection = { ok: true; project: NodeProject } | { ok: false; reason: "not_node" | "no_framework"; detail: string };

const NODE_FRAMEWORKS: NodeFramework[] = ["express", "fastify", "hono"];

/** The last file a package script runs (`node server.mjs`, `tsx src/index.ts`, `node --env-file=.env src/server.js`), or null. */
export function scriptEntry(script: string | undefined): string | null {
  if (!script) return null;
  const files = script.split(/\s+/).filter((token) => /^[\w@./-]+\.(?:m?js|cjs|ts|mts|cts)$/.test(token) && !token.startsWith("-"));
  return files.at(-1) ?? null;
}

export function detectNode(root: string, entryFlag: string | null): NodeDetection {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, reason: "not_node", detail: "no package.json here" };
  let pkg: { type?: string; main?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
  } catch {
    return { ok: false, reason: "not_node", detail: "package.json is not valid JSON" };
  }
  const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
  const frameworks = NODE_FRAMEWORKS.filter((name) => name in deps);
  const framework = frameworks[0];
  if (!framework) return { ok: false, reason: "no_framework", detail: "package.json depends on none of express, fastify, hono" };
  const candidates = [entryFlag, pkg.main, scriptEntry(pkg.scripts?.start), scriptEntry(pkg.scripts?.dev)].filter((c): c is string => typeof c === "string" && c.length > 0);
  const entry = candidates.find((c) => existsSync(join(root, c))) ?? null;
  let moduleStyle: "esm" | "cjs" = pkg.type === "module" ? "esm" : "cjs";
  if (entry) {
    if (/\.(?:mjs|mts|ts)$/.test(entry)) moduleStyle = "esm";
    else if (/\.(?:cjs|cts)$/.test(entry)) moduleStyle = "cjs";
    else if (/^\s*import\s[\s\S]*?\sfrom\s/m.test(readFileSync(join(root, entry), "utf8"))) moduleStyle = "esm";
  }
  const packageManager = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb")) ? "bun" : "npm";
  return { ok: true, project: { root, framework, frameworks, entry, moduleStyle, packageManager, envLocalIgnored: envLocalIgnored(root) } };
}

export const LOCK_DIR = ".journeys";
export const LOCK_FILE = "init.lock";

export function readLock(root: string): InitLock | null {
  const path = join(root, LOCK_DIR, LOCK_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InitLock;
  } catch {
    return null;
  }
}
