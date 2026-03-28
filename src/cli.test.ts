import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isHeadlessEnabled, parseCli } from "./cli.js";

function runBunScript(script: string) {
  return spawnSync("bun", ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("parseCli shows help mode with no arguments", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js"]), {
    mode: "help",
  });
});

test("parseCli parses run mode with headless enabled by default", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "run"]), {
    mode: "run",
    headless: true,
  });
});

test("parseCli parses run mode with a visible browser window", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "--window",
    ]),
    {
      mode: "run",
      headless: false,
    },
  );
});

test("parseCli parses the short -w alias for a visible browser window", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "-w",
    ]),
    {
      mode: "run",
      headless: false,
    },
  );
});

test("parseCli parses runtime browser-cookie config for run mode", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
      "--chrome-profile",
      "Profile 2",
    ]),
    {
      mode: "run",
      headless: true,
      browserCookies: {
        browser: "chrome",
        url: "https://x.com",
        profile: "Profile 2",
      },
    },
  );
});

test("parseCli rejects --cookie-url without --cookies-from-browser", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookie-url",
        "https://x.com",
      ]),
    /cookies-from-browser/i,
  );
});

test("parseCli rejects --cookie-url with a help token as its value", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookie-url",
        "--help",
      ]),
    /invalid url|invalid/i,
  );
});

test("parseCli rejects non-http browser-cookie URLs", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "chrome",
        "--cookie-url",
        "file:///tmp/cookies.txt",
      ]),
    /invalid url/i,
  );
});

test("parseCli rejects --chrome-profile without --cookies-from-browser", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--chrome-profile",
        "Profile 2",
      ]),
    /cookies-from-browser/i,
  );
});

test("parseCli rejects the removed --headless flag", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "run", "--headless"]),
    /unknown option|unknown command/i,
  );
});

test("parseCli rejects top-level run flags without the run subcommand", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "--cookies-from-browser",
        "chrome",
      ]),
    /unknown option/i,
  );
});

test("parseCli parses import-cookies mode", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "import-cookies",
      "--browser",
      "chrome",
      "--url",
      "https://x.com",
    ]),
    {
      mode: "import-cookies",
      browser: "chrome",
      url: "https://x.com",
    },
  );
});

test("parseCli rejects unsupported browser values for import-cookies", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "--browser",
        "firefox",
        "--url",
        "https://x.com",
      ]),
    /unsupported browser/i,
  );
});

test("parseCli rejects the removed config command", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "config", "path"]),
    /unknown command|too many arguments|unexpected/i,
  );
});

test("parseCli does not write Commander errors to stderr for run mode", () => {
  const result = runBunScript(`
    import { parseCli } from "./src/cli.ts";
    try {
      parseCli(["bun", "src/main.ts", "run", "--cookie-url", "https://x.com"]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  `);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
});

test("parseCli does not write Commander errors to stderr for import-cookies mode", () => {
  const result = runBunScript(`
    import { parseCli } from "./src/cli.ts";
    try {
      parseCli(["bun", "src/main.ts", "import-cookies", "--browser", "chrome"]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  `);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
});

test("parseCli rejects unsupported browser values for runtime browser cookies", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "firefox",
        "--cookie-url",
        "https://x.com",
      ]),
    /unsupported browser/i,
  );
});

test("parseCli requires --cookie-url when --cookies-from-browser is used", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "chrome",
      ]),
    /cookie-url/i,
  );
});

test("parseCli requires --browser for import-cookies", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "--url",
        "https://x.com",
      ]),
    /browser/i,
  );
});

test("parseCli requires --url for import-cookies", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "--browser",
        "chrome",
      ]),
    /url/i,
  );
});

test("parseCli rejects --url with a help token as its value", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "--browser",
        "chrome",
        "--url",
        "--help",
      ]),
    /invalid url|invalid/i,
  );
});

test("parseCli rejects non-http import URLs", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "--browser",
        "chrome",
        "--url",
        "chrome://settings",
      ]),
    /invalid url/i,
  );
});

test("isHeadlessEnabled returns false for help mode", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js"]), false);
});

test("isHeadlessEnabled returns true for run mode by default", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "run"]), true);
});

test("isHeadlessEnabled returns false when run mode uses --window", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "run", "--window"]), false);
});

test("isHeadlessEnabled returns false for valid import-cookies invocations", () => {
  assert.equal(
    isHeadlessEnabled([
      "node",
      "dist/main.js",
      "import-cookies",
      "--browser",
      "chrome",
      "--url",
      "https://x.com",
    ]),
    false,
  );
});

test("isHeadlessEnabled validates import-cookies invocations through parseCli", () => {
  assert.throws(
    () => isHeadlessEnabled(["node", "dist/main.js", "import-cookies"]),
    /required option/i,
  );
});

test("parseCli rejects import-cookies as a chrome profile value without browser cookies", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--chrome-profile",
        "import-cookies",
      ]),
    /cookies-from-browser/i,
  );
});

test("parseCli parses list-profiles mode", () => {
  assert.deepEqual(
    parseCli(["node", "dist/main.js", "list-profiles"]),
    {
      mode: "list-profiles",
    },
  );
});

test("parseCli rejects stray positional operands in run mode", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "run", "foo"]),
    /too many arguments/i,
  );
});

test("parseCli rejects excess operands in import-cookies mode", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "import-cookies",
        "foo",
        "--browser",
        "chrome",
        "--url",
        "https://x.com",
      ]),
    /too many arguments/i,
  );
});

test("bun src/main.ts exits cleanly with go-style usage output", () => {
  const result = spawnSync("bun", ["src/main.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: hedlis/i);
  assert.match(result.stdout, /\brun\b/);
  assert.match(result.stdout, /import-cookies/);
  assert.match(result.stdout, /list-profiles/);
  assert.match(result.stdout, /Examples:/);
  assert.match(result.stdout, /hedlis list-profiles/);
  assert.match(result.stdout, /hedlis run -w/);
  assert.equal(result.stderr, "");
});
