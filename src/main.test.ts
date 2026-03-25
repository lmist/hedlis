import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isHeadlessEnabled } from "./cli.js";

test("startup defaults to headed mode", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js"]), false);
});

test("startup enables headless mode with --headless", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "--headless"]), true);
});

test("startup uses bundled Chromium so side-loaded extensions can load", () => {
  const source = fs.readFileSync(path.resolve("src/main.ts"), "utf8");

  assert.match(source, /channel:\s*"chromium"/);
  assert.doesNotMatch(source, /channel:\s*"chrome"/);
});

test("startup threads the parsed headless flag into browser launch", () => {
  const source = fs.readFileSync(path.resolve("src/main.ts"), "utf8");

  assert.match(source, /const headless = isHeadlessEnabled\(process\.argv\);/);
  assert.match(source, /headless,\n\s+channel:\s*"chromium"/);
});
