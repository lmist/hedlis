import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("package metadata exposes the hedlis binary", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf8"),
  ) as {
    name?: string;
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  assert.equal(packageJson.name, "hedlis");
  assert.deepEqual(packageJson.bin, {
    hedlis: "src/main.ts",
  });
  assert.deepEqual(packageJson.files, ["src", "README.md", "usage.md"]);
  assert.equal(packageJson.scripts?.postinstall, "bun run src/install-extension.ts");
  assert.equal(
    packageJson.scripts?.build,
    "bun build --compile --outfile dist/hedlis -e electron -e 'chromium-bidi/*' src/main.ts"
  );
  assert.equal(packageJson.scripts?.test, "bun test");
  assert.equal(packageJson.scripts?.typecheck, "bunx tsc --noEmit");
  assert.ok(packageJson.dependencies?.patchright);
  assert.ok(packageJson.dependencies?.["adm-zip"]);
});

test("main entrypoint is a bun script", () => {
  const mainScript = fs.readFileSync(path.resolve("src/main.ts"), "utf8");

  assert.match(mainScript, /^#!\/usr\/bin\/env bun/m);
});

test("package tarball includes the bun entrypoint instead of the legacy node dist bundle", () => {
  const packOutput = execFileSync("bun", ["pm", "pack", "--dry-run"], {
    encoding: "utf8",
  });

  assert.match(packOutput, /src\/main\.ts/);
  assert.doesNotMatch(packOutput, /dist\/main\.js/);
});

test("readme documents the current Bun workflow and CLI surface", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf8");

  assert.match(readme, /^---$/m);
  assert.match(readme, /bun install/);
  assert.match(readme, /bun run build/);
  assert.match(readme, /bun test/);
  assert.match(readme, /bunx patchright install chromium/);
  assert.match(readme, /https:\/\/github\.com\/Kaliiiiiiiiii-Vinyzu\/patchright\//);
  assert.match(readme, /https:\/\/github\.com\/jackwener\/opencli/);
  assert.match(readme, /https:\/\/github\.com\/jackwener\/opencli\/releases\/download\/v1\.5\.5\/opencli-extension\.zip/);
  assert.match(readme, /list-profiles/);
  assert.match(readme, /\brun\b/);
  assert.match(readme, /--window/);
  assert.match(readme, /--output/);
  assert.match(readme, /~\/\.config\/hedlis/);
  assert.match(readme, /instagram/i);
  assert.match(readme, /youtube/i);
});
