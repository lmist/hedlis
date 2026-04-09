#!/usr/bin/env node

const { existsSync } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const distEntrypoint = path.join(rootDir, "dist", "install-extension.js");
const sourceEntrypoint = path.join(rootDir, "src", "install-extension.ts");
const tsxEntrypoint = path.join(rootDir, "node_modules", "tsx", "dist", "loader.mjs");
const patchrightCliEntrypoint = path.join(rootDir, "node_modules", "patchright", "cli.js");

const command = process.execPath;
const args = existsSync(sourceEntrypoint) && existsSync(tsxEntrypoint)
  ? ["--import", "tsx", sourceEntrypoint]
  : [distEntrypoint];

function runPostinstallStep(stepArgs) {
  execFileSync(command, stepArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

try {
  runPostinstallStep(args);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[cloak] Warning: failed to warm the OpenCLI extension cache during postinstall. cloak will retry at runtime. (${message})`
  );
}

if (existsSync(patchrightCliEntrypoint)) {
  try {
    runPostinstallStep([patchrightCliEntrypoint, "install", "chromium"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[cloak] Warning: failed to install the Patchright Chromium browser during postinstall. You can retry with 'npx patchright install chromium'. (${message})`
    );
  }
}
