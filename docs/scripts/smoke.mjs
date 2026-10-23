// The docs build's own verification: build, start on a free port, run the twin test against it.
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";

const DOCS = new URL("../", import.meta.url).pathname;
const port = Number(process.env.DOCS_PORT ?? 3917);
const url = `http://127.0.0.1:${port}`;

execFileSync("npm", ["run", "build"], { cwd: DOCS, stdio: "inherit" });
const server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: DOCS, stdio: ["ignore", "pipe", "pipe"] });
// The server's output is kept rather than streamed: a failure prints its last 40 lines, a pass stays quiet.
let output = "";
const keep = (chunk) => {
  output = `${output}${chunk}`.slice(-65_536);
};
server.stdout.on("data", keep);
server.stderr.on("data", keep);
const tail = () => output.split("\n").filter(Boolean).slice(-40).join("\n") || "(the server printed nothing)";
let exited = null;
server.on("exit", (code, signal) => {
  exited = signal ?? code;
});
const stop = () => {
  if (!server.killed) server.kill("SIGTERM");
};
process.on("exit", stop);

let ready = false;
let last = "no answer";
for (let i = 0; i < 60 && !ready && exited === null; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const response = await fetch(`${url}/llms.txt`);
    ready = response.ok;
    last = `${response.status} ${response.statusText}`.trim();
  } catch (error) {
    ready = false;
    last = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
  }
}
if (!ready) {
  stop();
  const why = exited === null ? `did not answer ok on ${url}/llms.txt within 30 s (last: ${last})` : `exited (${exited}) before answering on ${url}`;
  throw new Error(`smoke: the docs app ${why}; the server's last lines:\n${tail()}`);
}
const test = spawn("node", ["--test", join(DOCS, "test", "twins.test.mjs")], { cwd: DOCS, stdio: "inherit", env: { ...process.env, DOCS_URL: url, DOCS_PROBE: "no-salt" } });
const code = await new Promise((resolve) => test.on("exit", resolve));
stop();
if (code !== 0) console.error(`smoke: the twins failed (exit ${code}); the server's last lines:\n${tail()}`);
process.exit(code ?? 1);
