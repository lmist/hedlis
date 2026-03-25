import { Command } from "commander";

export type RunModeConfig = {
  mode: "run";
  headless: boolean;
  browserCookies?: {
    browser: "chrome";
    url: string;
    profile?: string;
  };
};

export type ImportCookiesConfig = {
  mode: "import-cookies";
  browser: "chrome";
  url: string;
  profile?: string;
  output?: string;
};

export type CliConfig = RunModeConfig | ImportCookiesConfig;

function parseChromeBrowser(value: string): "chrome" {
  if (value !== "chrome") {
    throw new Error(`unsupported browser: ${value}`);
  }

  return "chrome";
}

function parseRunMode(argv: string[]): RunModeConfig {
  const program = new Command();

  program
    .exitOverride()
    .allowUnknownOption(false)
    .option("--headless", "run headless")
    .option("--cookies-from-browser <browser>", "load cookies from a browser", parseChromeBrowser)
    .option("--cookie-url <url>", "site URL to scope browser cookies")
    .option("--chrome-profile <profile>", "Chrome profile name");

  const options = program.parse(argv, { from: "node" }).opts<{
    headless?: boolean;
    cookiesFromBrowser?: "chrome";
    cookieUrl?: string;
    chromeProfile?: string;
  }>();

  if (options.cookiesFromBrowser && !options.cookieUrl) {
    throw new Error("--cookie-url is required when --cookies-from-browser is used");
  }

  const browserCookies = options.cookiesFromBrowser
    ? {
        browser: options.cookiesFromBrowser,
        url: options.cookieUrl as string,
        ...(options.chromeProfile ? { profile: options.chromeProfile } : {}),
      }
    : undefined;

  return browserCookies
    ? {
        mode: "run",
        headless: Boolean(options.headless),
        browserCookies,
      }
    : {
        mode: "run",
        headless: Boolean(options.headless),
      };
}

function parseImportCookiesMode(argv: string[]): ImportCookiesConfig {
  const program = new Command();

  program
    .exitOverride()
    .allowUnknownOption(false)
    .name("hedlis")
    .command("import-cookies")
    .requiredOption("--browser <browser>", "browser to import cookies from", parseChromeBrowser)
    .requiredOption("--url <url>", "site URL to scope browser cookies")
    .option("--chrome-profile <profile>", "Chrome profile name")
    .option("--output <output>", "output file path");

  const parsed = program.parse(argv, { from: "node" });
  const importCommand = parsed.commands[0];

  if (!importCommand) {
    throw new Error("import-cookies command requires a subcommand");
  }

  const options = importCommand.opts<{
    browser: "chrome";
    url: string;
    chromeProfile?: string;
    output?: string;
  }>();

  return {
    mode: "import-cookies",
    browser: options.browser,
    url: options.url,
    ...(options.chromeProfile ? { profile: options.chromeProfile } : {}),
    ...(options.output ? { output: options.output } : {}),
  };
}

export function parseCli(argv: string[]): CliConfig {
  if (argv.includes("import-cookies")) {
    return parseImportCookiesMode(argv);
  }

  return parseRunMode(argv);
}

export function isHeadlessEnabled(argv: string[]): boolean {
  const parsed = parseCli(argv);
  return parsed.mode === "run" ? parsed.headless : false;
}
