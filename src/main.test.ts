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
    readChromeCookies: async (options: { url: string; profile?: string }) => {
      calls.push(options);
      return [cookie({ name: "auth", value: "runtime" })];
    },
  });

  assert.deepEqual(calls, [{ url: "https://x.com", profile: "Profile 2" }]);
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
    readChromeCookies: async () => [cookie({ name: "runtime", value: "2" })],
    warn: (message: string) => warnings.push(message),
  });

  assert.deepEqual(warnings, [CHROME_COOKIE_LIMITATION_WARNING]);
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
      readChromeCookies: async () => [],
    }),
    /No cookies found for https:\/\/x\.com/
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
        readChromeCookies: async () => [],
        prepareRequiredExtension: async () => {
          prepareRequiredExtensionCalls += 1;
          return "/tmp/opencli-extension";
        },
        launchPersistentContext: async () => {
          launchCalls += 1;
          throw new Error("launch should not be called");
        },
      }
    ),
    /No cookies found for https:\/\/x\.com/
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

test("main honors injected app paths for the extension cache", async () => {
  const seenExtensionsDirs: string[] = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      extensionsDir: "/tmp/injected-cache",
      cookiesDir: "/tmp/injected-cookies",
    },
    prepareRequiredExtension: async (extensionsDir: string) => {
      seenExtensionsDirs.push(extensionsDir);
      return "/tmp/opencli-extension";
    },
    makeTempDir: () => "/tmp/cloak-profile",
    makeDir: () => undefined,
    writeFile: () => undefined,
    launchPersistentContext: async () => fakeContext(),
  });

  assert.deepEqual(seenExtensionsDirs, ["/tmp/injected-cache"]);
});

test("main adds the resolved runtime cookie set to the browser context on successful startup", async () => {
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
        extensionsDir: "/tmp/injected-cache",
        cookiesDir: "/tmp/injected-cookies",
      },
      readChromeCookies: async () => [
        cookie({ name: "runtime", value: "3" }),
      ],
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext({ addedCookies }),
    }
  );

  assert.deepEqual(addedCookies, [[cookie({ name: "runtime", value: "3" })]]);
});

test("main resolves browser cookie targets interactively in a TTY when no cookie URL is provided", async () => {
  const readChromeCookieCalls: Array<{ url: string; profile?: string }> = [];

  await main(
    [
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
    ],
    {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      listChromeProfileSites: async () => [
        {
          directory: "Profile 2",
          name: "Work",
          sites: [{ host: "x.com", url: "https://x.com" }],
        },
      ],
      selectChromeSite: async () => ({
        profile: {
          directory: "Profile 2",
          name: "Work",
          sites: [{ host: "x.com", url: "https://x.com" }],
        },
        site: { host: "x.com", url: "https://x.com" },
      }),
      readChromeCookies: async (options) => {
        readChromeCookieCalls.push(options);
        return [cookie({ name: "runtime", value: "3" })];
      },
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext(),
    }
  );

  assert.deepEqual(readChromeCookieCalls, [
    { url: "https://x.com", profile: "Profile 2" },
  ]);
});

test("main persists imported cookies when the user accepts the prompt", async () => {
  const persistedWrites: Array<{ path: string; data: string }> = [];
  const createdDirs: string[] = [];

  await main(
    [
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
      "--persist-cookies",
    ],
    {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      appPaths: {
        extensionsDir: "/tmp/injected-cache",
        cookiesDir: "/tmp/injected-cookies",
      },
      readChromeCookies: async () => [cookie({ name: "runtime", value: "3" })],
      confirmPersistCookies: async () => true,
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: (targetPath: string) => {
        createdDirs.push(targetPath);
      },
      writeFile: (targetPath: string, data: string) => {
        persistedWrites.push({ path: targetPath, data });
      },
      launchPersistentContext: async () => fakeContext(),
    }
  );

  assert.deepEqual(createdDirs, ["/tmp/injected-cookies", "/tmp/cloak-profile/Default"]);
  assert.equal(persistedWrites[0]?.path, "/tmp/injected-cookies/x.com.json");
  assert.match(persistedWrites[0]?.data ?? "", /"name": "runtime"/);
});

test("main skips cookie persistence when the user declines the prompt", async () => {
  const persistedWrites: string[] = [];

  await main(
    [
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--cookie-url",
      "https://x.com",
      "--persist-cookies",
    ],
    {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      appPaths: {
        extensionsDir: "/tmp/injected-cache",
        cookiesDir: "/tmp/injected-cookies",
      },
      readChromeCookies: async () => [cookie({ name: "runtime", value: "3" })],
      confirmPersistCookies: async () => false,
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: () => undefined,
      writeFile: (targetPath: string) => {
        persistedWrites.push(targetPath);
      },
      launchPersistentContext: async () => fakeContext(),
    }
  );

  assert.deepEqual(persistedWrites, ["/tmp/cloak-profile/Default/Preferences"]);
});

test("main auto-selects a single-site profile without opening the picker", async () => {
  let selectChromeSiteCalls = 0;
  const readChromeCookieCalls: Array<{ url: string; profile?: string }> = [];

  await main(
    [
      "node",
      "dist/main.js",
      "run",
      "--cookies-from-browser",
      "chrome",
      "--chrome-profile",
      "Profile 2",
    ],
    {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      listChromeProfileSites: async () => [
        {
          directory: "Profile 2",
          name: "Work",
          sites: [{ host: "x.com", url: "https://x.com" }],
        },
      ],
      selectChromeSite: async () => {
        selectChromeSiteCalls += 1;
        throw new Error("picker should not be called");
      },
      readChromeCookies: async (options) => {
        readChromeCookieCalls.push(options);
        return [cookie({ name: "runtime", value: "3" })];
      },
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext(),
    }
  );

  assert.equal(selectChromeSiteCalls, 0);
  assert.deepEqual(readChromeCookieCalls, [
    { url: "https://x.com", profile: "Profile 2" },
  ]);
});

test("main requires a cookie URL outside an interactive terminal when browser cookies are requested", async () => {
  await assert.rejects(
    main(
      [
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "chrome",
      ],
      {
        stdinIsTTY: false,
        stdoutIsTTY: false,
      }
    ),
    /cookie-url is required/
  );
});

test("main requires a TTY when cookie persistence is requested", async () => {
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
        "--persist-cookies",
      ],
      {
        stdinIsTTY: false,
        stdoutIsTTY: false,
        readChromeCookies: async () => [cookie({ name: "runtime", value: "3" })],
      }
    ),
    /persist-cookies requires an interactive terminal/
  );
});

test("main prints a plain-text profile site report outside a TTY", async () => {
  let launchCalls = 0;
  let stdout = "";

  await main(["node", "dist/main.js", "profiles", "list"], {
    stdinIsTTY: false,
    stdoutIsTTY: false,
    writeStdout: (message: string) => {
      stdout += message;
    },
    listChromeProfileSites: async () => [
      {
        directory: "Default",
        name: "Main",
        sites: [{ host: "github.com", url: "https://github.com" }],
      },
    ],
    launchPersistentContext: async () => {
      launchCalls += 1;
      return fakeContext();
    },
  });

  assert.equal(launchCalls, 0);
  assert.match(stdout, /^Default: Main \(1 site\)$/m);
  assert.match(stdout, /^  github\.com$/m);
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
      extensionsDir: "/tmp/injected-cache",
      cookiesDir: "/tmp/injected-cookies",
    },
    prepareRequiredExtension: async () => "/tmp/opencli-extension",
    makeTempDir: () => "/tmp/cloak-profile",
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
      userDataDir: "/tmp/cloak-profile",
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
      extensionsDir: "/tmp/injected-cache",
      cookiesDir: "/tmp/injected-cookies",
    },
    prepareRequiredExtension: async () => "/tmp/opencli-extension",
    makeTempDir: () => "/tmp/cloak-profile",
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
        extensionsDir: "/tmp/injected-cache",
        cookiesDir: "/tmp/injected-cookies",
      },
      prepareRequiredExtension: async () => {
        throw new Error("extension download failed");
      },
      launchPersistentContext: async () => {
        launchCalls += 1;
        throw new Error("launch should not be called");
      },
    }),
    /extension download failed/
  );

  assert.equal(launchCalls, 0);
});

test("main preserves extension loading args for the required extension", async () => {
  const launchCalls: Array<{
    options: {
      headless: boolean;
      args: string[];
      executablePath?: string;
    };
  }> = [];

  await main(["node", "dist/main.js", "run"], {
    appPaths: {
      extensionsDir: "/tmp/injected-cache",
      cookiesDir: "/tmp/injected-cookies",
    },
    prepareRequiredExtension: async () => "/tmp/ext-a",
    makeTempDir: () => "/tmp/cloak-profile",
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
        extensionsDir: "/tmp/injected-cache",
        cookiesDir: "/tmp/injected-cookies",
      },
      prepareRequiredExtension: async () => "/tmp/opencli-extension",
      makeTempDir: () => "/tmp/cloak-profile",
      makeDir: () => undefined,
      writeFile: () => undefined,
      launchPersistentContext: async () => fakeContext(),
    });

    assert.equal(process.listenerCount("SIGINT"), sigintListenersBefore.length);
    assert.equal(process.listenerCount("SIGTERM"), sigtermListenersBefore.length);
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

function removeAdditionalListeners(signal: "SIGINT" | "SIGTERM", initialListeners: Function[]) {
  for (const listener of process.rawListeners(signal)) {
    if (!initialListeners.includes(listener)) {
      process.removeListener(signal, listener as (...args: any[]) => void);
    }
  }
}
