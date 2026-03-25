import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isHeadlessEnabled, parseCli } from "./cli.js";

function runNodeScript(script: string) {
  return spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("parseCli defaults to run mode with headless false", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js"]), {
    mode: "run",
    headless: false,
  });
});

test("parseCli enables headless mode with --headless", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "--headless"]), {
    mode: "run",
    headless: true,
  });
});

test("parseCli parses runtime browser-cookie config", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
      "--chrome-profile",
      "Profile 2",
    ]),
    {
      mode: "run",
      headless: false,
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
        "--cookie-url",
        "--help",
      ]),
    /invalid url|invalid/i,
  );
});

test("parseCli rejects --chrome-profile without --cookies-from-browser", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "--chrome-profile",
        "Profile 2",
      ]),
    /cookies-from-browser/i,
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

test("parseCli does not write Commander errors to stderr for run mode", () => {
  const result = runNodeScript(`
    const { parseCli } = require("./dist/cli.js");
    try {
      parseCli(["node", "dist/main.js", "--cookie-url", "https://x.com"]);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  `);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
});

test("parseCli does not write Commander errors to stderr for import-cookies mode", () => {
  const result = runNodeScript(`
    const { parseCli } = require("./dist/cli.js");
    try {
      parseCli(["node", "dist/main.js", "import-cookies", "--browser", "chrome"]);
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
        "--chrome-profile",
        "import-cookies",
      ]),
    /cookies-from-browser/i,
  );
});

test("parseCli rejects stray positional operands in run mode", () => {
  assert.throws(
    () => parseCli(["node", "dist/main.js", "foo"]),
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

test("node dist/main.js --help exits cleanly with usage output", () => {
  const result = spawnSync(process.execPath, ["dist/main.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/i);
  assert.equal(result.stderr, "");
});
