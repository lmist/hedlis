import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("package metadata exposes the cloak binary", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf8"),
  ) as {
    name?: string;
    engines?: Record<string, string>;
    repository?: { type?: string; url?: string };
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
    publishConfig?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.name, "@lmist/cloak");
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "https://github.com/lmist/cloak",
  });
  assert.equal(packageJson.engines?.node, ">=20");
  assert.deepEqual(packageJson.bin, {
    cloak: "bin/cloak.js",
  });
  assert.deepEqual(packageJson.files, [
    "bin",
    "dist",
    "scripts/postinstall.cjs",
    "docs/assets/cloak-logo-readme-centered.png",
    "src/app-paths.ts",
    "src/chrome-cookies.ts",
    "src/chrome-profile-sites.ts",
    "src/chrome-profiles.ts",
    "src/chrome-site-picker.ts",
    "src/cli.ts",
    "src/cookies.ts",
    "src/extension.ts",
    "src/install-extension.ts",
    "src/main.ts",
    "src/output.ts",
    "README.org",
  ]);
  assert.equal(packageJson.scripts?.postinstall, "node scripts/postinstall.cjs");
  assert.equal(
    packageJson.scripts?.build,
    "node scripts/build.cjs"
  );
  assert.equal(packageJson.scripts?.prepare, undefined);
  assert.equal(packageJson.scripts?.prepack, "npm run build");
  assert.equal(packageJson.scripts?.test, "node --import tsx --test src/**/*.test.ts");
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
  });
  assert.equal(
    packageJson.scripts?.typecheck,
    "node ./node_modules/typescript/bin/tsc --noEmit"
  );
  assert.equal(packageJson.scripts?.start, "node --import tsx src/main.ts");
  assert.ok(packageJson.dependencies?.patchright);
  assert.ok(packageJson.dependencies?.["adm-zip"]);
  assert.ok(packageJson.dependencies?.tsx);
  assert.ok(packageJson.dependencies?.chalk);
  assert.ok(packageJson.dependencies?.yargs);
  assert.equal(packageJson.dependencies?.["chrome-cookies-secure"], undefined);
  assert.ok(packageJson.optionalDependencies?.["chrome-cookies-secure"]);
  assert.ok(packageJson.optionalDependencies?.sqlite3);
  assert.ok(packageJson.devDependencies?.typescript);
  assert.ok(packageJson.devDependencies?.["@types/node"]);
  assert.equal(packageJson.dependencies?.commander, undefined);
});

test("main entrypoint preserves a node shebang for the built CLI", () => {
  const mainScript = fs.readFileSync(path.resolve("src/main.ts"), "utf8");

  assert.match(mainScript, /^#!\/usr\/bin\/env node/m);
});

test("postinstall warms the extension cache and installs Patchright Chromium", () => {
  const postinstall = fs.readFileSync(path.resolve("scripts/postinstall.cjs"), "utf8");

  assert.match(postinstall, /"src", "install-extension\.ts"/);
  assert.match(postinstall, /"node_modules", "patchright", "cli\.js"/);
  assert.match(postinstall, /"install", "chromium"/);
  assert.match(postinstall, /failed to warm the OpenCLI extension cache during postinstall/);
  assert.match(postinstall, /failed to install the Patchright Chromium browser during postinstall/);
});

test("package tarball includes the built node entrypoint", () => {
  const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-npm-cache-"));
  execFileSync("npm", ["run", "build"], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
  });
  const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
  });
  const [{ files }] = JSON.parse(packOutput) as Array<{
    files: Array<{ path: string }>;
  }>;
  const packedPaths = files.map((file) => file.path);

  assert.ok(packedPaths.includes("bin/cloak.js"));
  assert.ok(packedPaths.includes("dist/main.js"));
  assert.ok(packedPaths.includes("docs/assets/cloak-logo-readme-centered.png"));
  assert.ok(packedPaths.includes("scripts/postinstall.cjs"));
  assert.ok(packedPaths.includes("src/main.ts"));
  assert.ok(!packedPaths.includes("dist/import-cookies.js"));
  assert.ok(!packedPaths.includes("dist/install-bootstrap.js"));
  assert.ok(!packedPaths.includes("src/package.test.ts"));
});

test("readme documents the current Node workflow and CLI surface", () => {
  const readme = fs.readFileSync(path.resolve("README.org"), "utf8");

  assert.match(readme, /^#\+title: cloak$/m);
  assert.match(readme, /^#\+property: header-args:sh :results output verbatim :exports code$/m);
  assert.match(readme, /^\* what it is$/m);
  assert.match(readme, /^\* prerequisites$/m);
  assert.match(readme, /^\* install$/m);
  assert.match(readme, /^\* from source$/m);
  assert.match(readme, /^\* setup and usage$/m);
  assert.match(readme, /^\* one sharp edge$/m);
  assert.match(readme, /npm install -g @lmist\/cloak/);
  assert.match(readme, /git clone https:\/\/github\.com\/lmist\/cloak\.git/);
  assert.match(readme, /npm install/);
  assert.match(readme, /npx patchright install chromium/);
  assert.match(readme, /npm run build/);
  assert.match(readme, /node dist\/main\.js --help/);
  assert.match(readme, /npm install -g \./);
  assert.match(readme, /cloak --help/);
  assert.match(readme, /npm install -g @jackwener\/opencli/);
  assert.match(readme, /npx skills add jackwener\/opencli/);
  assert.match(readme, /npm test/);
  assert.match(readme, /https:\/\/github\.com\/Kaliiiiiiiiii-Vinyzu\/patchright\//);
  assert.match(readme, /https:\/\/github\.com\/jackwener\/opencli/);
  assert.match(readme, /https:\/\/github\.com\/jackwener\/opencli\/releases\/download\/v1\.6\.8\/opencli-extension\.zip/);
  assert.match(readme, /profiles list/);
  assert.match(readme, /\bcloak run\b/);
  assert.match(readme, /--window/);
  assert.match(readme, /~\/\.cache\/cloak/);
  assert.match(readme, /https:\/\/x\.com/);
  assert.match(readme, /chrome-profile "Default"/);
  assert.match(readme, /--cookies-from-browser chrome/);
  assert.match(readme, /chrome-cookies-secure/);
  assert.doesNotMatch(readme, /cookies import/);
});
