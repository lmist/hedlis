import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("package metadata exposes the hedlis binary", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf8"),
  ) as {
    name?: string;
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  assert.equal(packageJson.name, "hedlis");
  assert.deepEqual(packageJson.bin, {
    hedlis: "dist/main.js",
  });
  assert.equal(packageJson.scripts?.prepare, "npm run build");
  assert.ok(packageJson.dependencies?.patchright);
});

test("compiled main entrypoint is executable as a node script", () => {
  const mainScript = fs.readFileSync(path.resolve("dist/main.js"), "utf8");

  assert.match(mainScript, /^#!\/usr\/bin\/env node/m);
});

test("readme documents engine configuration and patchright setup", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf8");

  assert.match(readme, /hedlis config set engine patchright/);
  assert.match(readme, /hedlis config get engine/);
  assert.match(readme, /npx patchright install chromium/);
});
