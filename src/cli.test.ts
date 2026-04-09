import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isHeadlessEnabled, parseCli } from "./cli.js";

function runInlineScript(script: string) {
  return spawnSync("node", ["--import", "tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("parseCli shows help mode with no arguments", () => {
  const cli = parseCli(["node", "dist/main.js"]);

  assert.equal(cli.mode, "help");
  assert.match(cli.text, /Usage:\s+cloak <command>/i);
  assert.doesNotMatch(cli.text, /cookies import/i);
  assert.match(cli.text, /profiles list/i);
});

test("parseCli parses run mode with headless enabled by default", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "run"]), {
    mode: "run",
    headless: true,
  });
});

test("parseCli parses run mode with a visible browser window", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "run", "--window"]), {
    mode: "run",
    headless: false,
  });
});

test("parseCli parses runtime browser-cookie config without requiring --cookie-url", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--chrome-profile",
      "Profile 2",
    ]),
    {
      mode: "run",
      headless: true,
      browserCookies: {
        browser: "chrome",
        profile: "Profile 2",
      },
    }
  );
});

test("parseCli parses runtime browser-cookie config with persistence enabled", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--persist-cookies",
    ]),
    {
      mode: "run",
      headless: true,
      persistCookies: true,
      browserCookies: {
        browser: "chrome",
      },
    }
  );
});

test("parseCli parses runtime browser-cookie config with an explicit URL", () => {
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
    }
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
    /cookies-from-browser/i
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
    /invalid url|invalid/i
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
    /invalid url/i
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
    /cookies-from-browser/i
  );
});

test("parseCli rejects --persist-cookies without --cookies-from-browser", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--persist-cookies",
      ]),
    /cookies-from-browser/i
  );
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
      ]),
    /unsupported browser/i
  );
});

test("parseCli rejects the removed --headless flag", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "run", "--headless"]),
    /unknown|arguments/i
  );
});

test("parseCli rejects the removed cookies import command", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "cookies",
        "import",
        "--browser",
        "chrome",
      ]),
    /unknown|arguments/i
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
    /unknown|arguments/i
  );
});

test("parseCli rejects the removed config command", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "config", "path"]),
    /unknown command|unknown arguments|unknown/i
  );
});

test("parseCli does not write yargs errors to stderr for run mode", () => {
  const result = runInlineScript(`
    const { parseCli } = require("./src/cli.ts");
    try {
      parseCli(["node", "src/main.ts", "run", "--cookie-url", "https://x.com"]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  `);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
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

test("parseCli parses profiles list mode", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "profiles", "list"]), {
    mode: "list-profiles",
  });
});

test("parseCli rejects stray positional operands in run mode", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "run", "foo"]),
    /unknown|arguments/i
  );
});

test("node --import tsx src/main.ts exits cleanly with cloak usage output", () => {
  const result = spawnSync("node", ["--import", "tsx", "src/main.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:\s+cloak/i);
  assert.match(result.stdout, /\brun\b/);
  assert.doesNotMatch(result.stdout, /cookies import/);
  assert.match(result.stdout, /profiles list/);
  assert.match(result.stdout, /Examples:/);
  assert.match(result.stdout, /cloak profiles list/);
  assert.match(result.stdout, /cloak run -w/);
  assert.equal(result.stderr, "");
});
