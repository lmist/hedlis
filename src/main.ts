import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { prepareExtensions } from "./extension.js";
import { loadCookies, mergeCookies, type Cookie } from "./cookies.js";
import { parseCli, type RunModeConfig } from "./cli.js";
import { importCookiesCommand } from "./import-cookies.js";
import { readChromeCookies } from "./chrome-cookies.js";

type ResolveStartupCookiesDependencies = {
  cookiesDir?: string;
  loadCookies?: typeof loadCookies;
  readChromeCookies?: typeof readChromeCookies;
};

type StartupContext = {
  addCookies(cookies: Cookie[]): Promise<void>;
  browser(): { on(event: "disconnected", listener: () => void): void } | null;
  on(event: "close", listener: () => void): void;
  close(): Promise<void>;
};

type MainDependencies = ResolveStartupCookiesDependencies & {
  prepareExtensions?: typeof prepareExtensions;
  launchPersistentContext?: (
    userDataDir: string,
    options: {
      headless: boolean;
      channel: "chromium";
      args: string[];
    }
  ) => Promise<StartupContext>;
  makeTempDir?: (prefix: string) => string;
  makeDir?: (path: string, options: { recursive: true }) => void;
  writeFile?: (path: string, data: string) => void;
};

export async function resolveStartupCookies(
  cli: RunModeConfig,
  dependencies: ResolveStartupCookiesDependencies = {}
): Promise<Cookie[]> {
  const cookiesDir = dependencies.cookiesDir ?? path.resolve("cookies");
  const loadCookiesFn = dependencies.loadCookies ?? loadCookies;
  const diskCookies = await loadCookiesFn(cookiesDir);

  if (!cli.browserCookies) {
    return diskCookies;
  }

  const readChromeCookiesFn =
    dependencies.readChromeCookies ?? readChromeCookies;
  const browserCookies = await readChromeCookiesFn({
    url: cli.browserCookies.url,
    profile: cli.browserCookies.profile,
  });

  if (browserCookies.length === 0) {
    throw new Error(`No cookies found for ${cli.browserCookies.url}`);
  }

  return mergeCookies(diskCookies, browserCookies);
}

export async function main(
  argv: string[] = process.argv,
  dependencies: MainDependencies = {}
) {
  const cli = parseCli(argv);
  if (cli.mode === "import-cookies") {
    const result = await importCookiesCommand({
      url: cli.url,
      profile: cli.profile,
      output: cli.output,
      outputRoot: process.cwd(),
    });
    console.log(`Imported ${result.count} cookies to ${result.outputPath}`);
    return;
  }

  const extensionsDir = path.resolve("extensions");
  const cookiesDir = dependencies.cookiesDir ?? path.resolve("cookies");
  const cookies = await resolveStartupCookies(cli, {
    cookiesDir,
    loadCookies: dependencies.loadCookies,
    readChromeCookies: dependencies.readChromeCookies,
  });
  const prepareExtensionsFn =
    dependencies.prepareExtensions ?? prepareExtensions;
  const launchPersistentContext =
    dependencies.launchPersistentContext ??
    chromium.launchPersistentContext.bind(chromium);
  const makeTempDir = dependencies.makeTempDir ?? fs.mkdtempSync;
  const makeDir = dependencies.makeDir ?? fs.mkdirSync;
  const writeFile = dependencies.writeFile ?? fs.writeFileSync;

  // Prepare extensions from zips
  const extensionPaths = await prepareExtensionsFn(extensionsDir);

  // Build chromium args
  const args: string[] = [];
  if (extensionPaths.length > 0) {
    const joined = extensionPaths.join(",");
    args.push(`--disable-extensions-except=${joined}`);
    args.push(`--load-extension=${joined}`);
  }

  // Persistent context is required for Chrome extensions to load
  const userDataDir = makeTempDir(path.join(os.tmpdir(), "vilnius-profile-"));

  // Enable developer mode for extensions in the fresh profile
  const defaultDir = path.join(userDataDir, "Default");
  makeDir(defaultDir, { recursive: true });
  writeFile(
    path.join(defaultDir, "Preferences"),
    JSON.stringify({
      extensions: { ui: { developer_mode: true } },
    })
  );

  // Chrome ignores the side-load flags; Playwright's bundled Chromium does not.
  const context = await launchPersistentContext(userDataDir, {
    headless: cli.headless,
    channel: "chromium",
    args,
  });

  // Inject cookies
  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`Injected ${cookies.length} cookies`);
  }

  console.log("Browser running. Ctrl+C to exit.");

  // Keep alive until browser closes or process is killed
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
      if (browser) browser.on("disconnected", finish);
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
  main().catch((err) => {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "commander.helpDisplayed"
    ) {
      process.exit(0);
    }

    console.error(err);
    process.exit(1);
  });
}
