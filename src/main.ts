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

type MainDependencies = ResolveStartupCookiesDependencies & {
  prepareExtensions?: typeof prepareExtensions;
  launchPersistentContext?: typeof chromium.launchPersistentContext;
  makeTempDir?: typeof fs.mkdtempSync;
  makeDir?: typeof fs.mkdirSync;
  writeFile?: typeof fs.writeFileSync;
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
  const cookiesDir = path.resolve("cookies");
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
  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
    if (browser) browser.on("disconnected", () => resolve());
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      resolve();
    });
    process.on("SIGTERM", () => {
      console.log("\nShutting down...");
      resolve();
    });
  });

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
