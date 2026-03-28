import { Command } from "commander";
import { parseEngine, type BrowserEngine } from "./config.js";

export type RunModeConfig = {
  mode: "run";
  headless: boolean;
  engine?: BrowserEngine;
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

export type ConfigGetMode = {
  mode: "config-get";
  key: "engine";
};

export type ConfigSetMode = {
  mode: "config-set";
  key: "engine";
  value: BrowserEngine;
};

export type ConfigPathMode = {
  mode: "config-path";
};

export type CliConfig =
  | RunModeConfig
  | ImportCookiesConfig
  | ConfigGetMode
  | ConfigSetMode
  | ConfigPathMode;

function parseChromeBrowser(value: string): "chrome" {
  if (value !== "chrome") {
    throw new Error(`unsupported browser: ${value}`);
  }

  return "chrome";
}

function parseConfigKey(value: string): "engine" {
  if (value !== "engine") {
    throw new Error(`unsupported config key: ${value}`);
  }

  return value;
}

function parseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`invalid site URL: ${value}`);
    }
    return value;
  } catch {
    throw new Error(`invalid URL: ${value}`);
  }
}

function silenceCommanderStderr(command: Command): Command {
  return command.configureOutput({
    writeErr: () => undefined,
  });
}

function addImportCookiesCommand(program: Command): Command {
  const importCommand = silenceCommanderStderr(program.command("import-cookies"));

  importCommand
    .requiredOption(
      "--browser <browser>",
      "browser to import cookies from (chrome only)",
      parseChromeBrowser
    )
    .requiredOption("--url <url>", "HTTP(S) site URL to scope Chrome cookies", parseUrl)
    .option("--chrome-profile <profile>", "Chrome profile name")
    .option("--output <output>", "output file path");

  return importCommand;
}

function buildRunModeProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .name("hedlis")
    .option("--engine <engine>", "browser engine to use (playwright or patchright)", parseEngine)
    .option("--headless", "run headless")
    .option("--cookies-from-browser <browser>", "load cookies from Chrome", parseChromeBrowser)
    .option("--cookie-url <url>", "HTTP(S) site URL to scope Chrome cookies", parseUrl)
    .option("--chrome-profile <profile>", "Chrome profile name");

  program.addHelpText(
    "after",
    "\nCommands:\n  import-cookies  import cookies from Chrome into cookies/\n  config          get or set persistent CLI defaults"
  );

  return program;
}

function buildImportCookiesProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .name("hedlis");

  const importCommand = addImportCookiesCommand(program);

  return { program, importCommand };
}

function parseConfigMode(argv: string[]): ConfigGetMode | ConfigSetMode | ConfigPathMode {
  const args = argv.slice(2);

  if (args[0] !== "config") {
    throw new Error("config mode requires the config subcommand");
  }

  if (args[1] === "path" && args.length === 2) {
    return { mode: "config-path" };
  }

  if (args[1] === "get" && args.length === 3) {
    return {
      mode: "config-get",
      key: parseConfigKey(args[2]),
    };
  }

  if (args[1] === "set" && args.length === 4) {
    return {
      mode: "config-set",
      key: parseConfigKey(args[2]),
      value: parseEngine(args[3]),
    };
  }

  throw new Error("usage: hedlis config <get|set|path> ...");
}

function parseRunMode(argv: string[]): RunModeConfig {
  const program = buildRunModeProgram();

  const options = program.parse(argv, { from: "node" }).opts<{
    engine?: BrowserEngine;
    headless?: boolean;
    cookiesFromBrowser?: "chrome";
    cookieUrl?: string;
    chromeProfile?: string;
  }>();

  if (options.cookiesFromBrowser && !options.cookieUrl) {
    throw new Error("--cookie-url is required when --cookies-from-browser is used");
  }

  if (!options.cookiesFromBrowser && (options.cookieUrl || options.chromeProfile)) {
    throw new Error("--cookie-url and --chrome-profile require --cookies-from-browser");
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
        ...(options.engine ? { engine: options.engine } : {}),
        browserCookies,
      }
    : {
        mode: "run",
        headless: Boolean(options.headless),
        ...(options.engine ? { engine: options.engine } : {}),
      };
}

function parseImportCookiesMode(argv: string[]): ImportCookiesConfig {
  const { program, importCommand } = buildImportCookiesProgram();

  const parsed = program.parse(argv, { from: "node" });
  const parsedImportCommand = parsed.commands[0];

  if (!parsedImportCommand) {
    throw new Error("import-cookies command requires a subcommand");
  }

  const options = parsedImportCommand.opts<{
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
  if (argv.slice(2)[0] === "import-cookies") {
    return parseImportCookiesMode(argv);
  }

  if (argv.slice(2)[0] === "config") {
    return parseConfigMode(argv);
  }

  return parseRunMode(argv);
}

export function isHeadlessEnabled(argv: string[]): boolean {
  try {
    const parsed = parseCli(argv);
    return parsed.mode === "run" ? parsed.headless : false;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "commander.helpDisplayed"
    ) {
      process.exit(0);
    }

    throw error;
  }
}
