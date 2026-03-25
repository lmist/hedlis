import test from "node:test";
import assert from "node:assert/strict";
import { parseCli, isHeadlessEnabled, type RunModeConfig } from "./cli.js";
import type { Cookie } from "./cookies.js";
import { main, resolveStartupCookies } from "./main.js";

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

test("main does not reach browser startup when explicit browser-cookie import returns none", async () => {
  let prepareExtensionsCalls = 0;
  let launchCalls = 0;

  await assert.rejects(
    main(
      [
        "node",
        "dist/main.js",
        "--cookies-from-browser",
        "chrome",
        "--cookie-url",
        "https://x.com",
      ],
      {
        loadCookies: async () => [cookie({ name: "disk", value: "1" })],
        readChromeCookies: async () => [],
        prepareExtensions: async () => {
          prepareExtensionsCalls += 1;
          return [];
        },
        launchPersistentContext: async () => {
          launchCalls += 1;
          throw new Error("launch should not be called");
        },
      },
    ),
    /No cookies found for https:\/\/x\.com/,
  );

  assert.equal(prepareExtensionsCalls, 0);
  assert.equal(launchCalls, 0);
});

test("main honors an injected cookiesDir instead of resolving the working-directory cookies path", async () => {
  const seenCookiesDirs: string[] = [];

  await main(["node", "dist/main.js"], {
    cookiesDir: "/tmp/injected-cookies",
    loadCookies: async (cookiesDir: string) => {
      seenCookiesDirs.push(cookiesDir);
      return [];
    },
    prepareExtensions: async () => [],
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    launchPersistentContext: async () => fakeContext(),
  });

  assert.deepEqual(seenCookiesDirs, ["/tmp/injected-cookies"]);
});

test("main adds the resolved merged cookie set to the browser context on successful startup", async () => {
  const addedCookies: Cookie[][] = [];

  await main(
    [
      "node",
      "dist/main.js",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
    ],
    {
      cookiesDir: "/tmp/injected-cookies",
      loadCookies: async () => [cookie({ name: "disk", value: "1" })],
      readChromeCookies: async () => [
        cookie({ name: "disk", value: "2" }),
        cookie({ name: "runtime", value: "3" }),
      ],
      prepareExtensions: async () => [],
      makeTempDir: () => "/tmp/vilnius-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext({ addedCookies }),
    },
  );

  assert.deepEqual(addedCookies, [[
    cookie({ name: "disk", value: "2" }),
    cookie({ name: "runtime", value: "3" }),
  ]]);
});

test("main preserves the chromium launch contract for headless startup", async () => {
  const launchCalls: Array<{
    userDataDir: string;
    options: { headless: boolean; channel: "chromium"; args: string[] };
  }> = [];

  await main(["node", "dist/main.js", "--headless"], {
    cookiesDir: "/tmp/injected-cookies",
    loadCookies: async () => [],
    prepareExtensions: async () => [],
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    launchPersistentContext: async (userDataDir, options) => {
      launchCalls.push({ userDataDir, options });
      return fakeContext();
    },
  });

  assert.deepEqual(launchCalls, [
    {
      userDataDir: "/tmp/vilnius-profile",
      options: {
        headless: true,
        channel: "chromium",
        args: [],
      },
    },
  ]);
});

test("main removes SIGINT and SIGTERM listeners before returning", async () => {
  const sigintListenersBefore = process.rawListeners("SIGINT");
  const sigtermListenersBefore = process.rawListeners("SIGTERM");

  try {
    await main(["node", "dist/main.js"], {
      cookiesDir: "/tmp/injected-cookies",
      loadCookies: async () => [],
      prepareExtensions: async () => [],
      makeTempDir: () => "/tmp/vilnius-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext(),
    });

    assert.equal(
      process.listenerCount("SIGINT"),
      sigintListenersBefore.length,
    );
    assert.equal(
      process.listenerCount("SIGTERM"),
      sigtermListenersBefore.length,
    );
  } finally {
    removeAdditionalListeners("SIGINT", sigintListenersBefore);
    removeAdditionalListeners("SIGTERM", sigtermListenersBefore);
  }
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

function fakeContext({
  addedCookies,
}: {
  addedCookies?: Cookie[][];
} = {}) {
  return {
    addCookies: async (cookies: Cookie[]) => {
      addedCookies?.push(cookies);
    },
    browser: () => null,
    on: (event: string, callback: () => void) => {
      if (event === "close") {
        callback();
      }
    },
    close: async () => undefined,
  };
}

function removeAdditionalListeners(
  signal: "SIGINT" | "SIGTERM",
  initialListeners: Function[],
) {
  for (const listener of process.rawListeners(signal)) {
    if (!initialListeners.includes(listener)) {
      process.removeListener(signal, listener as (...args: any[]) => void);
    }
  }
}
