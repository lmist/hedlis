import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { prepareExtensions } from "./extension.js";
import { loadCookies } from "./cookies.js";
import { isHeadlessEnabled, parseCli } from "./cli.js";
import { importCookiesCommand } from "./import-cookies.js";

async function main() {
  const cli = parseCli(process.argv);
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
  const headless = isHeadlessEnabled(process.argv);

  // Prepare extensions from zips
  const extensionPaths = await prepareExtensions(extensionsDir);

  // Build chromium args
  const args: string[] = [];
  if (extensionPaths.length > 0) {
    const joined = extensionPaths.join(",");
    args.push(`--disable-extensions-except=${joined}`);
    args.push(`--load-extension=${joined}`);
  }

  // Persistent context is required for Chrome extensions to load
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vilnius-profile-"));

  // Enable developer mode for extensions in the fresh profile
  const defaultDir = path.join(userDataDir, "Default");
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, "Preferences"),
    JSON.stringify({
      extensions: { ui: { developer_mode: true } },
    })
  );

  // Chrome ignores the side-load flags; Playwright's bundled Chromium does not.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    channel: "chromium",
    args,
  });

  // Inject cookies
  const cookies = await loadCookies(cookiesDir);
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
