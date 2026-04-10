import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
    name?: string;
    version?: string;
    license?: string;
    description?: string;
    engines?: Record<string, string>;
    repository?: { type?: string; url?: string };
    bin?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
    publishConfig?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }
}

test("package metadata exposes the cloak binary and current runtime contract", () => {
  const packageJson = readPackageJson()

  assert.equal(packageJson.name, "@lmist/cloak")
  assert.equal(packageJson.version, "2.0.1")
  assert.equal(packageJson.license, "MIT")
  assert.match(packageJson.description ?? "", /daemonized Patchright startup/i)
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/lmist/cloak.git",
  })
  assert.equal(packageJson.engines?.node, ">=24")
  assert.deepEqual(packageJson.bin, {
    cloak: "bin/cloak.js",
  })
  assert.deepEqual([...packageJson.files ?? []].sort(), [
    ".githooks/pre-commit",
    ".githooks/pre-push",
    "bin",
    "dist",
    "scripts/postinstall.cjs",
    "scripts/render-readme.cjs",
    "scripts/setup-git-hooks.cjs",
    "docs/assets/cloak-logo-readme-centered.png",
    "src/app-paths.ts",
    "src/chrome-cookies.ts",
    "src/chrome-profile-sites.ts",
    "src/chrome-profiles.ts",
    "src/cli.ts",
    "src/cookies.ts",
    "src/daemon.ts",
    "src/extension.ts",
    "src/install-extension.ts",
    "src/main.ts",
    "src/output.ts",
    "src/state-db.ts",
    "README.md",
    "README.org",
  ].sort())
  assert.equal(packageJson.scripts?.postinstall, "node scripts/postinstall.cjs")
  assert.equal(packageJson.scripts?.build, "node scripts/build.cjs")
  assert.equal(packageJson.scripts?.["render-readme"], "node scripts/render-readme.cjs")
  assert.equal(packageJson.scripts?.["check-readme"], "node scripts/render-readme.cjs --check")
  assert.equal(packageJson.scripts?.prepack, "npm run build")
  assert.equal(packageJson.scripts?.test, "node --import tsx --test src/**/*.test.ts")
  assert.equal(packageJson.scripts?.typecheck, "node ./node_modules/typescript/bin/tsc --noEmit")
  assert.equal(packageJson.scripts?.start, "node --import tsx src/main.ts")
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
  })
  assert.ok(packageJson.dependencies?.patchright)
  assert.ok(packageJson.dependencies?.["adm-zip"])
  assert.ok(packageJson.dependencies?.tsx)
  assert.ok(packageJson.dependencies?.chalk)
  assert.ok(packageJson.dependencies?.yargs)
  assert.equal(packageJson.optionalDependencies, undefined)
  assert.ok(packageJson.devDependencies?.typescript)
  assert.ok(packageJson.devDependencies?.["@types/node"])
})

test("main entrypoint preserves a node shebang for the built CLI", () => {
  const mainScript = fs.readFileSync(path.resolve("src/main.ts"), "utf8")

  assert.match(mainScript, /^#!\/usr\/bin\/env node/m)
})

test("postinstall warms the extension cache and installs Patchright Chromium", () => {
  const postinstall = fs.readFileSync(path.resolve("scripts/postinstall.cjs"), "utf8")

  assert.match(postinstall, /"src", "install-extension\.ts"/)
  assert.match(postinstall, /"node_modules", "patchright", "cli\.js"/)
  assert.match(postinstall, /"install", "chromium"/)
  assert.match(postinstall, /setup-git-hooks\.cjs/)
})

test("package tarball includes the built node entrypoint and new runtime modules", () => {
  const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-npm-cache-"))
  execFileSync("npm", ["run", "build"], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
  })
  const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
    },
  })
  const [{ files }] = JSON.parse(packOutput) as Array<{
    files: Array<{ path: string }>;
  }>
  const packedPaths = files.map((file) => file.path)

  assert.ok(packedPaths.includes("bin/cloak.js"))
  assert.ok(packedPaths.includes("dist/main.js"))
  assert.ok(packedPaths.includes("dist/daemon.js"))
  assert.ok(packedPaths.includes("dist/state-db.js"))
  assert.ok(packedPaths.includes("README.md"))
  assert.ok(!packedPaths.includes("src/chrome-site-picker.ts"))
  assert.ok(!packedPaths.includes("src/persisted-cookies.ts"))
  assert.ok(!packedPaths.includes("src/package.test.ts"))
})

test("readme documents the current CLI surface", () => {
  const readme = fs.readFileSync(path.resolve("README.org"), "utf8")

  assert.match(readme, /^#\+title: cloak$/m)
  assert.match(readme, /^\* usage$/m)
  assert.match(readme, /cloak profiles list/)
  assert.match(readme, /cloak profiles set default "Profile 7"/)
  assert.match(readme, /cloak profiles status/)
  assert.match(readme, /cloak cookies list/)
  assert.match(readme, /cloak run --persist-cookies --consent --cookie-url https:\/\/x\.com/)
  assert.match(readme, /cloak run --profile "Profile 7" --persist-cookies --consent --cookie-url https:\/\/x\.com/)
  assert.match(readme, /cloak run --daemon/)
  assert.match(readme, /cloak inspect/)
  assert.match(readme, /cloak stop/)
  assert.match(readme, /cloak state display/)
  assert.match(readme, /cloak state destroy/)
  assert.match(readme, /~\/\.config\/cloak\/state\.sqlite/)
  assert.doesNotMatch(readme, /--cookies-from-browser/)
  assert.doesNotMatch(readme, /chrome-site-picker/)
  assert.doesNotMatch(readme, /chrome-cookies-secure/)
})

test("generated README.md exists and is marked as generated", () => {
  const readme = fs.readFileSync(path.resolve("README.md"), "utf8")

  assert.match(
    readme,
    /^<!-- Generated from README\.org by scripts\/render-readme\.cjs\. Do not edit README\.md directly\. -->/m
  )
  assert.match(readme, /@lmist\/cloak/)
  assert.match(readme, /browser sidecar .*OpenCLI/i)
})
