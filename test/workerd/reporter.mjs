// A vitest reporter that writes what the Workers runtime cannot write itself: each fixture test
// hands its masked canonical output and its latency to the reporter through `task.meta`, and the
// reporter writes test/identity/out/workerd/<nn>.json and latency.json on the Node side.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = join(ROOT, "test", "identity", "out", "workerd");

export default class WorkerdOutputReporter {
  constructor() {
    this.latency = {};
    this.written = 0;
    mkdirSync(OUT, { recursive: true });
  }

  take(meta) {
    const w = meta?.workerd;
    if (!w || this.latency[w.name]) return;
    writeFileSync(join(OUT, `${w.name}.json`), w.out);
    this.latency[w.name] = { p50: w.p50, p95: w.p95 };
    this.written += 1;
  }

  // vitest 3 and later: one call per finished test case; the meta travels back from the Worker.
  onTestCaseResult(testCase) {
    try {
      this.take(testCase.meta());
    } catch {
      // The run-end hooks below cover a reporter shape without per-case meta.
    }
  }

  finish() {
    writeFileSync(join(OUT, "latency.json"), JSON.stringify(this.latency, null, 2));
    process.stdout.write(`workerd: ${this.written} fixture outputs written to test/identity/out/workerd\n`);
  }

  // vitest 4: the end-of-run hook receives the test modules; walk their test cases for any meta
  // onTestCaseResult did not see, then write the latency table.
  onTestRunEnd(testModules = []) {
    for (const mod of testModules) {
      try {
        for (const testCase of mod.children.allTests()) this.take(testCase.meta());
      } catch {
        // A module without children (a failed suite) has no meta to take.
      }
    }
    this.finish();
  }

  // vitest 2: the legacy hook with the task tree.
  onFinished(files = []) {
    const visit = (task) => {
      if (task?.meta?.workerd) this.take(task.meta);
      for (const child of task?.tasks ?? []) visit(child);
    };
    for (const file of files) visit(file);
    this.finish();
  }
}
