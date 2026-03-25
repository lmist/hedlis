import test from "node:test";
import assert from "node:assert/strict";
import { isHeadlessEnabled, parseCli } from "./cli.js";

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

test("parseCli keeps import-cookies as an option value in run mode", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "--chrome-profile",
      "import-cookies",
      "--headless",
    ]),
    {
      mode: "run",
      headless: true,
    },
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
