#!/usr/bin/env node
import { chromium as patchrightChromium } from "patchright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import readline from "node:readline/promises";
import { resolveAppPaths, type AppPaths } from "./app-paths.js";
import { prepareRequiredExtension } from "./extension.js";
import type { Cookie } from "./cookies.js";
import { parseCli, type RunModeConfig } from "./cli.js";
import {
  CHROME_COOKIE_LIMITATION_WARNING,
  readChromeCookies,
} from "./chrome-cookies.js";
import {
  formatChromeProfileSitesReport,
  listChromeProfileSites,
} from "./chrome-profile-sites.js";
import { runChromeSitePicker } from "./chrome-site-picker.js";
import { persistedCookiePath, serializeCookies } from "./persisted-cookies.js";
import { formatError, formatInfo, formatSuccess, formatWarning } from "./output.js";

type ResolveStartupCookiesDependencies = {
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

type ConfirmPersistCookiesOptions = {
  cookieCount: number;
  targetPath: string;
  url: string;
};

type MainDependencies = ResolveStartupCookiesDependencies & {
  appPaths?: AppPaths;
  prepareRequiredExtension?: typeof prepareRequiredExtension;
  listChromeProfileSites?: typeof listChromeProfileSites;
  selectChromeSite?: typeof runChromeSitePicker;
  confirmPersistCookies?: (
    options: ConfirmPersistCookiesOptions
  ) => Promise<boolean>;
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
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
};

export async function resolveStartupCookies(
  cli: RunModeConfig,
  dependencies: ResolveStartupCookiesDependencies = {}
): Promise<Cookie[]> {
  if (!cli.browserCookies) {
    return [];
  }

  const readChromeCookiesFn =
    dependencies.readChromeCookies ?? readChromeCookies;
  const warn = dependencies.warn ?? ((message: string) => console.warn(formatWarning(message)));
  const cookieUrl = cli.browserCookies.url;

  if (!cookieUrl) {
    throw new Error("Browser cookie URL must be resolved before startup.");
  }

  const browserCookies = await readChromeCookiesFn({
    url: cookieUrl,
    profile: cli.browserCookies.profile,
  });

  if (browserCookies.length === 0) {
    throw new Error(`No cookies found for ${cookieUrl}`);
  }

  warn(CHROME_COOKIE_LIMITATION_WARNING);

  return browserCookies;
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
    writeStdout(cli.text);
    return;
  }

  if (cli.mode === "list-profiles") {
    const listProfileSites =
      dependencies.listChromeProfileSites ?? listChromeProfileSites;
    const selectChromeSite = dependencies.selectChromeSite ?? runChromeSitePicker;
    const profiles = await listProfileSites();

    if (!isInteractiveTerminal(dependencies)) {
      writeStdout(formatChromeProfileSitesReport(profiles));
      return;
    }

    if (profiles.length === 0) {
      console.log(formatInfo("No Chrome profiles found."));
      return;
    }

    const selection = await selectChromeSite({ profiles });
    if (selection) {
      console.log(formatSuccess(`${selection.profile.directory}: ${selection.site.url}`));
    }

    return;
  }

  const resolvedCli = await resolveRunConfig(cli, dependencies);
  if (!resolvedCli) {
    return;
  }

  const cookies = await resolveStartupCookies(resolvedCli, {
    readChromeCookies: dependencies.readChromeCookies,
  });
  await persistStartupCookies(resolvedCli, cookies, appPaths, dependencies);
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

  const userDataDir = makeTempDir(path.join(os.tmpdir(), "cloak-profile-"));

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
    headless: resolvedCli.headless,
    executablePath: executablePath(),
    args,
  });

  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(formatSuccess(`Injected ${cookies.length} cookies`));
  }

  console.log(formatInfo("Browser running. Ctrl+C to exit."));

  const browser = context.browser();
  let onSigint: (() => void) | undefined;
  let onSigterm: (() => void) | undefined;
  const handleSignal = () => {
    console.log(formatInfo("\nShutting down..."));
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
    console.error(formatError(String(error)));
    process.exit(1);
  });
}

async function resolveRunConfig(
  cli: RunModeConfig,
  dependencies: Pick<
    MainDependencies,
    "listChromeProfileSites" | "selectChromeSite" | "stdinIsTTY" | "stdoutIsTTY"
  >
): Promise<RunModeConfig | undefined> {
  if (!cli.browserCookies || cli.browserCookies.url) {
    return cli;
  }

  if (!isInteractiveTerminal(dependencies)) {
    throw new Error(
      "--cookie-url is required when --cookies-from-browser is used outside an interactive terminal"
    );
  }

  const listProfileSites =
    dependencies.listChromeProfileSites ?? listChromeProfileSites;
  const selectChromeSite = dependencies.selectChromeSite ?? runChromeSitePicker;
  const profiles = (await listProfileSites()).filter((profile) => profile.sites.length > 0);

  if (profiles.length === 0) {
    throw new Error("No Chrome cookie-bearing sites found.");
  }

  const requestedProfile = cli.browserCookies.profile;
  const initialProfile = requestedProfile
    ? profiles.find((profile) => profile.directory === requestedProfile)
    : profiles.length === 1
      ? profiles[0]
      : undefined;

  if (requestedProfile && !initialProfile) {
    throw new Error(`Chrome profile not found: ${requestedProfile}`);
  }

  if (initialProfile && initialProfile.sites.length === 1) {
    return {
      ...cli,
      browserCookies: {
        ...cli.browserCookies,
        profile: initialProfile.directory,
        url: initialProfile.sites[0].url,
      },
    };
  }

  const selection = await selectChromeSite({
    profiles,
    ...(initialProfile ? { initialProfileDirectory: initialProfile.directory } : {}),
    ...(initialProfile ? { lockProfile: true } : {}),
  });

  if (!selection) {
    return undefined;
  }

  return {
    ...cli,
    browserCookies: {
      ...cli.browserCookies,
      profile: selection.profile.directory,
      url: selection.site.url,
    },
  };
}

function isInteractiveTerminal(
  dependencies: Pick<MainDependencies, "stdinIsTTY" | "stdoutIsTTY">
): boolean {
  const stdinIsTTY = dependencies.stdinIsTTY ?? process.stdin.isTTY ?? false;
  const stdoutIsTTY = dependencies.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  return stdinIsTTY && stdoutIsTTY;
}

async function persistStartupCookies(
  cli: RunModeConfig,
  cookies: Cookie[],
  appPaths: AppPaths,
  dependencies: Pick<
    MainDependencies,
    "confirmPersistCookies" | "makeDir" | "writeFile" | "stdinIsTTY" | "stdoutIsTTY"
  >
): Promise<void> {
  if (!cli.persistCookies) {
    return;
  }

  if (!cli.browserCookies?.url) {
    throw new Error("Cookie persistence requires a resolved browser cookie URL.");
  }

  if (!isInteractiveTerminal(dependencies)) {
    throw new Error("--persist-cookies requires an interactive terminal");
  }

  const targetPath = persistedCookiePath(cli.browserCookies.url, appPaths.cookiesDir);
  const confirmPersistCookies =
    dependencies.confirmPersistCookies ?? defaultConfirmPersistCookies;
  const accepted = await confirmPersistCookies({
    cookieCount: cookies.length,
    targetPath,
    url: cli.browserCookies.url,
  });

  if (!accepted) {
    return;
  }

  const makeDir = dependencies.makeDir ?? fs.mkdirSync;
  const writeFile = dependencies.writeFile ?? fs.writeFileSync;
  makeDir(appPaths.cookiesDir, { recursive: true });
  writeFile(targetPath, serializeCookies(cookies));
  console.log(formatSuccess(`Persisted ${cookies.length} cookies to ${targetPath}`));
}

async function defaultConfirmPersistCookies(
  options: ConfirmPersistCookiesOptions
): Promise<boolean> {
  const prompt = [
    `Persist ${options.cookieCount} imported Chrome cookies for ${options.url}`,
    `to ${options.targetPath}? [y/N] `,
  ].join("\n");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(prompt);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
