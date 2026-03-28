import test from "node:test";
import assert from "node:assert/strict";
import { parseCli, isHeadlessEnabled, type RunModeConfig } from "./cli.js";
import type { Cookie } from "./cookies.js";
import { main, resolveStartupCookies } from "./main.js";
import { CHROME_COOKIE_LIMITATION_WARNING } from "./chrome-cookies.js";

test("startup defaults to help mode", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js"]), false);
});

test("startup enables headless run mode by default", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "run"]), true);
});

test("startup defaults to no browser-cookie access when no flags are present", async () => {
  const cli = parseRunCli(["node", "dist/main.js", "run"]);
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
    "run",
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
    "run",
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

test("runtime browser-cookie loading warns about the Chrome duplicate-cookie limitation", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "run",
    "--cookies-from-browser",
    "chrome",
    "--cookie-url",
    "https://x.com",
  ]);
  const warnings: string[] = [];

  await resolveStartupCookies(cli, {
    cookiesDir: "/tmp/cookies",
    loadCookies: async () => [],
    readChromeCookies: async () => [cookie({ name: "runtime", value: "2" })],
    warn: (message: string) => warnings.push(message),
  });

  assert.deepEqual(warnings, [CHROME_COOKIE_LIMITATION_WARNING]);
});

test("browser-imported cookies win exact name-domain-path collisions", async () => {
  const cli = parseRunCli([
    "node",
    "dist/main.js",
    "run",
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
    "run",
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
  let prepareRequiredExtensionCalls = 0;
  let launchCalls = 0;

  await assert.rejects(
    main(
      [
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "chrome",
        "--cookie-url",
        "https://x.com",
      ],
      {
        loadCookies: async () => [cookie({ name: "disk", value: "1" })],
        readChromeCookies: async () => [],
        prepareRequiredExtension: async () => {
          prepareRequiredExtensionCalls += 1;
          return "/tmp/opencli-extension";
        },
        launchPersistentContext: async () => {
          launchCalls += 1;
          throw new Error("launch should not be called");
        },
      },
    ),
    /No cookies found for https:\/\/x\.com/,
  );

  assert.equal(prepareRequiredExtensionCalls, 0);
  assert.equal(launchCalls, 0);
});

test("main shows help and does not launch a browser when no arguments are provided", async () => {
  let launchCalls = 0;

  await main(["node", "dist/main.js"], {
    launchPersistentContext: async () => {
      launchCalls += 1;
      return fakeContext();
    },
  });

  assert.equal(launchCalls, 0);
});

test("main honors injected app paths instead of resolving storage from the working directory", async () => {
  const seenCookiesDirs: string[] = [];
  const seenExtensionsDirs: string[] = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      rootDir: "/tmp/injected-root",
      cookiesDir: "/tmp/injected-root/cookies",
      extensionsDir: "/tmp/injected-root/extensions",
    },
    loadCookies: async (cookiesDir: string) => {
      seenCookiesDirs.push(cookiesDir);
      return [];
    },
    prepareRequiredExtension: async (extensionsDir: string) => {
      seenExtensionsDirs.push(extensionsDir);
      return "/tmp/opencli-extension";
    },
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    launchPersistentContext: async () => fakeContext(),
  });

  assert.deepEqual(seenCookiesDirs, ["/tmp/injected-root/cookies"]);
  assert.deepEqual(seenExtensionsDirs, ["/tmp/injected-root/extensions"]);
});

test("main adds the resolved merged cookie set to the browser context on successful startup", async () => {
  const addedCookies: Cookie[][] = [];

  await main(
    [
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
    ],
    {
      appPaths: {
        rootDir: "/tmp/injected-root",
        cookiesDir: "/tmp/injected-root/cookies",
        extensionsDir: "/tmp/injected-root/extensions",
      },
      loadCookies: async () => [cookie({ name: "disk", value: "1" })],
      readChromeCookies: async () => [
        cookie({ name: "disk", value: "2" }),
        cookie({ name: "runtime", value: "3" }),
      ],
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
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

test("main uses the patchright launch contract for headless startup", async () => {
  const launchCalls: Array<{
    userDataDir: string;
    options: {
      headless: boolean;
      executablePath?: string;
      args: string[];
    };
  }> = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      rootDir: "/tmp/injected-root",
      cookiesDir: "/tmp/injected-root/cookies",
      extensionsDir: "/tmp/injected-root/extensions",
    },
    loadCookies: async () => [],
    prepareRequiredExtension: async () => "/tmp/opencli-extension",
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    patchrightExecutablePath: () => "/tmp/google-chrome-for-testing",
    patchrightLaunchPersistentContext: async (userDataDir, options) => {
      launchCalls.push({ userDataDir, options });
      return fakeContext();
    },
  });

  assert.deepEqual(launchCalls, [
    {
      userDataDir: "/tmp/vilnius-profile",
      options: {
        headless: true,
        executablePath: "/tmp/google-chrome-for-testing",
        args: [
          "--disable-extensions-except=/tmp/opencli-extension",
          "--load-extension=/tmp/opencli-extension",
        ],
      },
    },
  ]);
});

test("main opens a visible browser window when run mode uses --window", async () => {
  const launchCalls: Array<{ headless: boolean }> = [];

  await main(["node", "dist/main.js", "run", "--window"], {
    appPaths: {
      rootDir: "/tmp/injected-root",
      cookiesDir: "/tmp/injected-root/cookies",
      extensionsDir: "/tmp/injected-root/extensions",
    },
    loadCookies: async () => [],
    prepareRequiredExtension: async () => "/tmp/opencli-extension",
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    patchrightExecutablePath: () => "/tmp/google-chrome-for-testing",
    patchrightLaunchPersistentContext: async (_userDataDir, options) => {
      launchCalls.push({ headless: options.headless });
      return fakeContext();
    },
  });

  assert.deepEqual(launchCalls, [{ headless: false }]);
});

test("main fails before browser launch when required extension bootstrap fails", async () => {
  let launchCalls = 0;

  await assert.rejects(
    main(["node", "dist/main.js", "run"], {
      appPaths: {
        rootDir: "/tmp/injected-root",
        cookiesDir: "/tmp/injected-root/cookies",
        extensionsDir: "/tmp/injected-root/extensions",
      },
      loadCookies: async () => [],
      prepareRequiredExtension: async () => {
        throw new Error("extension download failed");
      },
      launchPersistentContext: async () => {
        launchCalls += 1;
        throw new Error("launch should not be called");
      },
    }),
    /extension download failed/,
  );

  assert.equal(launchCalls, 0);
});

test("main uses patchright by default", async () => {
  const launchCalls: Array<{
    userDataDir: string;
    options: {
      headless: boolean;
      args: string[];
      executablePath?: string;
      channel?: "chromium";
    };
  }> = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      rootDir: "/tmp/injected-root",
      cookiesDir: "/tmp/injected-root/cookies",
      extensionsDir: "/tmp/injected-root/extensions",
    },
    loadCookies: async () => [],
    prepareRequiredExtension: async () => "/tmp/opencli-extension",
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    patchrightExecutablePath: () => "/tmp/google-chrome-for-testing",
    patchrightLaunchPersistentContext: async (userDataDir, options) => {
      launchCalls.push({ userDataDir, options });
      return fakeContext();
    },
  });

  assert.deepEqual(launchCalls, [
    {
      userDataDir: "/tmp/vilnius-profile",
      options: {
        headless: true,
        executablePath: "/tmp/google-chrome-for-testing",
        args: [
          "--disable-extensions-except=/tmp/opencli-extension",
          "--load-extension=/tmp/opencli-extension",
        ],
      },
    },
  ]);
});

test("main preserves extension loading args for the required extension", async () => {
  const launchCalls: Array<{
    options: {
      headless: boolean;
      args: string[];
      executablePath?: string;
      channel?: "chromium";
    };
  }> = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      rootDir: "/tmp/injected-root",
      cookiesDir: "/tmp/injected-root/cookies",
      extensionsDir: "/tmp/injected-root/extensions",
    },
    loadCookies: async () => [],
    prepareRequiredExtension: async () => "/tmp/ext-a",
    makeTempDir: () => "/tmp/vilnius-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    patchrightExecutablePath: () => "/tmp/google-chrome-for-testing",
    patchrightLaunchPersistentContext: async (_userDataDir, options) => {
      launchCalls.push({ options });
      return fakeContext();
    },
  });

  assert.deepEqual(launchCalls, [
    {
      options: {
        headless: true,
        executablePath: "/tmp/google-chrome-for-testing",
        args: [
          "--disable-extensions-except=/tmp/ext-a",
          "--load-extension=/tmp/ext-a",
        ],
      },
    },
  ]);
});

test("main removes SIGINT and SIGTERM listeners before returning", async () => {
  const sigintListenersBefore = process.rawListeners("SIGINT");
  const sigtermListenersBefore = process.rawListeners("SIGTERM");

  try {
    await main(["node", "dist/main.js", "run"], {
      appPaths: {
        rootDir: "/tmp/injected-root",
        cookiesDir: "/tmp/injected-root/cookies",
        extensionsDir: "/tmp/injected-root/extensions",
      },
      loadCookies: async () => [],
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
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
