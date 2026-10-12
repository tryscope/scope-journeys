#!/usr/bin/env node
import("../dist/cli/index.js")
  .then(({ main }) => main(process.argv.slice(2)))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`journeys: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(5);
  });
