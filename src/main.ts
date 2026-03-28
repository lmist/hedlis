#!/usr/bin/env bun
import { chromium as patchrightChromium } from "patchright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { resolveAppPaths, type AppPaths } from "./app-paths.js";
import { prepareRequiredExtension } from "./extension.js";
import { loadCookies, mergeCookies, type Cookie } from "./cookies.js";
import { parseCli, rootHelpText, type RunModeConfig } from "./cli.js";
import { importCookiesCommand } from "./import-cookies.js";
import {
  CHROME_COOKIE_LIMITATION_WARNING,
  readChromeCookies,
} from "./chrome-cookies.js";
import { listChromeProfiles } from "./chrome-profiles.js";

type ResolveStartupCookiesDependencies = {
  cookiesDir?: string;
  loadCookies?: typeof loadCookies;
  readChromeCookies?: typeof readChromeCookies;
  warn?: (message: string) => void;
};

type StartupContext = {
  addCookies(cookies: Cookie[]): Promise<void>;
  browser(): { on(event: "disconnected", listener: () => void): void } | null;
  on(event: "close", listener: () => void): void;
  close(): Promise<void>;
};

type LaunchOptions = {
  headless: boolean;
  args: string[];
  executablePath?: string;
};

type MainDependencies = ResolveStartupCookiesDependencies & {
  appPaths?: AppPaths;
  prepareRequiredExtension?: typeof prepareRequiredExtension;
  launchPersistentContext?: (
    userDataDir: string,
    options: LaunchOptions
  ) => Promise<StartupContext>;
  patchrightLaunchPersistentContext?: (
    userDataDir: string,
    options: LaunchOptions
  ) => Promise<StartupContext>;
  patchrightExecutablePath?: () => string;
  makeTempDir?: (prefix: string) => string;
  makeDir?: (path: string, options: { recursive: true }) => void;
  writeFile?: (path: string, data: string) => void;
  writeStdout?: (message: string) => void;
};

export async function resolveStartupCookies(
  cli: RunModeConfig,
  dependencies: ResolveStartupCookiesDependencies = {}
): Promise<Cookie[]> {
  const cookiesDir = dependencies.cookiesDir ?? resolveAppPaths().cookiesDir;
  const loadCookiesFn = dependencies.loadCookies ?? loadCookies;
  const diskCookies = await loadCookiesFn(cookiesDir);

  if (!cli.browserCookies) {
    return diskCookies;
  }

  const readChromeCookiesFn =
    dependencies.readChromeCookies ?? readChromeCookies;
  const warn = dependencies.warn ?? console.warn;
  const browserCookies = await readChromeCookiesFn({
    url: cli.browserCookies.url,
    profile: cli.browserCookies.profile,
  });

  if (browserCookies.length === 0) {
    throw new Error(`No cookies found for ${cli.browserCookies.url}`);
  }

  warn(CHROME_COOKIE_LIMITATION_WARNING);

  return mergeCookies(diskCookies, browserCookies);
}

export async function main(
  argv: string[] = process.argv,
  dependencies: MainDependencies = {}
) {
  const cli = parseCli(argv);
  const appPaths = dependencies.appPaths ?? resolveAppPaths();
  const writeStdout =
    dependencies.writeStdout ?? ((message: string) => process.stdout.write(message));

  if (cli.mode === "help") {
    writeStdout(rootHelpText());
    return;
  }

  if (cli.mode === "list-profiles") {
    const profiles = listChromeProfiles();
    if (profiles.length === 0) {
      console.log("No Chrome profiles found.");
    } else {
      for (const profile of profiles) {
        const label = profile.accountName ?? profile.name;
        console.log(`${profile.directory}: ${label}`);
      }
    }
    return;
  }

  if (cli.mode === "import-cookies") {
    const result = await importCookiesCommand({
      url: cli.url,
      profile: cli.profile,
      output: cli.output,
      cwd: process.cwd(),
      cookiesDir: appPaths.cookiesDir,
    });
    console.log(`Imported ${result.count} cookies to ${result.outputPath}`);
    return;
  }

  const cookiesDir = dependencies.cookiesDir ?? appPaths.cookiesDir;
  const cookies = await resolveStartupCookies(cli, {
    cookiesDir,
    loadCookies: dependencies.loadCookies,
    readChromeCookies: dependencies.readChromeCookies,
  });
  const prepareExtension =
    dependencies.prepareRequiredExtension ?? prepareRequiredExtension;
  const launchPersistentContext =
    dependencies.patchrightLaunchPersistentContext ??
    dependencies.launchPersistentContext ??
    patchrightChromium.launchPersistentContext.bind(patchrightChromium);
  const makeTempDir = dependencies.makeTempDir ?? fs.mkdtempSync;
  const makeDir = dependencies.makeDir ?? fs.mkdirSync;
  const writeFile = dependencies.writeFile ?? fs.writeFileSync;
  const extensionPath = await prepareExtension(appPaths.extensionsDir);
  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ];

  const userDataDir = makeTempDir(path.join(os.tmpdir(), "vilnius-profile-"));

  const defaultDir = path.join(userDataDir, "Default");
  makeDir(defaultDir, { recursive: true });
  writeFile(
    path.join(defaultDir, "Preferences"),
    JSON.stringify({
      extensions: { ui: { developer_mode: true } },
    })
  );

  const executablePath =
    dependencies.patchrightExecutablePath ??
    patchrightChromium.executablePath.bind(patchrightChromium);
  const context = await launchPersistentContext(userDataDir, {
    headless: cli.headless,
    executablePath: executablePath(),
    args,
  });

  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`Injected ${cookies.length} cookies`);
  }

  console.log("Browser running. Ctrl+C to exit.");

  const browser = context.browser();
  let onSigint: (() => void) | undefined;
  let onSigterm: (() => void) | undefined;
  const handleSignal = () => {
    console.log("\nShutting down...");
  };

  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };
      onSigint = () => {
        handleSignal();
        finish();
      };
      onSigterm = () => {
        handleSignal();
        finish();
      };

      context.on("close", finish);
      if (browser) {
        browser.on("disconnected", finish);
      }
      process.on("SIGINT", onSigint);
      process.on("SIGTERM", onSigterm);
    });
  } finally {
    if (onSigint) {
      process.removeListener("SIGINT", onSigint);
    }

    if (onSigterm) {
      process.removeListener("SIGTERM", onSigterm);
    }
  }

  await context.close().catch(() => {});
}

if (require.main === module) {
  main().catch((error) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "commander.helpDisplayed"
    ) {
      process.exit(0);
    }

    console.error(error);
    process.exit(1);
  });
}
