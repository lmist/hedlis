#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const distEntrypoint = path.join(packageRoot, "dist", "main.js");
const sourceEntrypoint = path.join(packageRoot, "src", "main.ts");

const childArgs = fs.existsSync(distEntrypoint)
  ? [distEntrypoint, ...process.argv.slice(2)]
  : ["--import", "tsx", sourceEntrypoint, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, childArgs, {
  stdio: "inherit",
  cwd: packageRoot,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
