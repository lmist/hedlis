import test from "node:test";
import assert from "node:assert/strict";
import { parseCli } from "./cli.js";

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
