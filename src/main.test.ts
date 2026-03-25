import test from "node:test";
import assert from "node:assert/strict";
import { parseCli, isHeadlessEnabled, type RunModeConfig } from "./cli.js";
import type { Cookie } from "./cookies.js";
import { resolveStartupCookies } from "./main.js";

test("startup defaults to headed mode", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js"]), false);
});

test("startup enables headless mode with --headless", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "--headless"]), true);
});

test("startup defaults to no browser-cookie access when no flags are present", async () => {
  const cli = parseRunCli(["node", "dist/main.js"]);
  let readChromeCookiesCalls = 0;

  const cookies = await resolveStartupCookies(cli, {
    cookiesDir: "/tmp/cookies",
    loadCookies: async () => [],
    readChromeCookies: async () => {
      readChromeCookiesCalls += 1;
      return [];
    },
  });

  assert.deepEqual(cookies, []);
  assert.equal(readChromeCookiesCalls, 0);
});

test("runtime browser-cookie flags are parsed and threaded into startup", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "--cookies-from-browser",
    "chrome",
    "--cookie-url",
    "https://x.com",
    "--chrome-profile",
    "Profile 2",
  ]);
  const calls: Array<{ url: string; profile?: string }> = [];

  await resolveStartupCookies(cli, {
    cookiesDir: "/tmp/cookies",
    loadCookies: async () => [],
    readChromeCookies: async (options: { url: string; profile?: string }) => {
      calls.push(options);
      return [cookie({ name: "auth", value: "runtime" })];
    },
  });

  assert.deepEqual(calls, [{ url: "https://x.com", profile: "Profile 2" }]);
});

test("runtime browser cookies merge with loadCookies results", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "--cookies-from-browser",
    "chrome",
    "--cookie-url",
    "https://x.com",
  ]);

  const cookies = await resolveStartupCookies(cli, {
    cookiesDir: "/tmp/cookies",
    loadCookies: async () => [cookie({ name: "disk", value: "1" })],
    readChromeCookies: async () => [cookie({ name: "runtime", value: "2" })],
  });

  assert.deepEqual(cookies, [
    cookie({ name: "disk", value: "1" }),
    cookie({ name: "runtime", value: "2" }),
  ]);
});

test("browser-imported cookies win exact name-domain-path collisions", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "--cookies-from-browser",
    "chrome",
    "--cookie-url",
    "https://x.com",
  ]);

  const cookies = await resolveStartupCookies(cli, {
    cookiesDir: "/tmp/cookies",
    loadCookies: async () => [
      cookie({ name: "auth", value: "disk", domain: ".x.com", path: "/" }),
      cookie({ name: "other", value: "keep" }),
    ],
    readChromeCookies: async () => [
      cookie({ name: "auth", value: "runtime", domain: ".x.com", path: "/" }),
    ],
  });

  assert.deepEqual(cookies, [
    cookie({ name: "auth", value: "runtime", domain: ".x.com", path: "/" }),
    cookie({ name: "other", value: "keep" }),
  ]);
});

test("startup fails fast when browser cookies are explicitly requested but Chrome returns none", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "--cookies-from-browser",
    "chrome",
    "--cookie-url",
    "https://x.com",
  ]);

  await assert.rejects(
    resolveStartupCookies(cli, {
      cookiesDir: "/tmp/cookies",
      loadCookies: async () => [cookie({ name: "disk", value: "1" })],
      readChromeCookies: async () => [],
    }),
    /No cookies found for https:\/\/x\.com/,
  );
});

function cookie(overrides: Partial<Cookie>): Cookie {
  return {
    name: overrides.name ?? "session",
    value: overrides.value ?? "value",
    domain: overrides.domain ?? ".example.com",
    path: overrides.path ?? "/",
  };
}

function parseRunCli(argv: string[]): RunModeConfig {
  const cli = parseCli(argv);
  assert.equal(cli.mode, "run");
  return cli;
}
