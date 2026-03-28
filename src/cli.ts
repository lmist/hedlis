import { Command } from "commander";

export type HelpMode = {
  mode: "help";
};

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

export type ListProfilesMode = {
  mode: "list-profiles";
};

export type CliConfig =
  | HelpMode
  | RunModeConfig
  | ImportCookiesConfig
  | ListProfilesMode;

function parseChromeBrowser(value: string): "chrome" {
  if (value !== "chrome") {
    throw new Error(`unsupported browser: ${value}`);
  }

  return "chrome";
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

function buildRootProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .showHelpAfterError()
    .name("hedlis")
    .description(
      "OpenCLI companion built on Patchright. Use `run` to launch headless by default."
    )
    .usage("<command> [options]");

  program.addCommand(
    new Command("run").summary("launch Patchright headless by default")
  );
  program.addCommand(
    new Command("import-cookies").summary(
      "import Chrome cookies into ~/.config/hedlis/cookies/"
    )
  );
  program.addCommand(
    new Command("list-profiles").summary("list available Chrome profiles")
  );

  return program;
}

function buildRunProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .showHelpAfterError()
    .name("hedlis run")
    .description(
      "Launch Patchright with the pinned OpenCLI extension. Headless by default."
    )
    .usage("[options]")
    .option("-w, --window", "open a visible browser window")
    .option(
      "--cookies-from-browser <browser>",
      "load cookies from Chrome for this run",
      parseChromeBrowser
    )
    .option("--cookie-url <url>", "HTTP(S) site URL to scope Chrome cookies", parseUrl)
    .option("--chrome-profile <profile>", "Chrome profile name");

  program.addHelpText(
    "afterAll",
    `
Examples:
  hedlis run
  hedlis run -w
  hedlis run --cookies-from-browser chrome --cookie-url https://x.com

Storage:
  hedlis loads saved cookies from ~/.config/hedlis/cookies/
`
  );

  return program;
}

function buildImportCookiesProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .showHelpAfterError()
    .name("hedlis import-cookies")
    .description("Import Chrome cookies into ~/.config/hedlis/cookies/.")
    .requiredOption(
      "--browser <browser>",
      "browser to import cookies from (chrome only)",
      parseChromeBrowser
    )
    .requiredOption("--url <url>", "HTTP(S) site URL to scope Chrome cookies", parseUrl)
    .option("--chrome-profile <profile>", "Chrome profile name")
    .option("--output <output>", "output file path");

  return program;
}

function buildListProfilesProgram() {
  const program = silenceCommanderStderr(new Command());

  program
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .showHelpAfterError()
    .name("hedlis list-profiles")
    .description("List available Chrome profiles.")
    .usage("");

  return program;
}

function parseRootMode(argv: string[]): never {
  buildRootProgram().parse(argv.slice(2), { from: "user" });
  throw new Error("root mode parsing should not return");
}

function parseRunMode(argv: string[]): RunModeConfig {
  const options = buildRunProgram().parse(argv.slice(3), { from: "user" }).opts<{
    window?: boolean;
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
        headless: !Boolean(options.window),
        browserCookies,
      }
    : {
        mode: "run",
        headless: !Boolean(options.window),
      };
}

function parseImportCookiesMode(argv: string[]): ImportCookiesConfig {
  const options = buildImportCookiesProgram().parse(argv.slice(3), {
    from: "user",
  }).opts<{
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

function parseListProfilesMode(argv: string[]): ListProfilesMode {
  buildListProfilesProgram().parse(argv.slice(3), { from: "user" });
  return { mode: "list-profiles" };
}

export function parseCli(argv: string[]): CliConfig {
  const command = argv.slice(2)[0];

  if (!command) {
    return { mode: "help" };
  }

  if (command === "-h" || command === "--help") {
    return { mode: "help" };
  }

  if (command === "run") {
    return parseRunMode(argv);
  }

  if (command === "import-cookies") {
    return parseImportCookiesMode(argv);
  }

  if (command === "list-profiles") {
    return parseListProfilesMode(argv);
  }

  return parseRootMode(argv);
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

export function rootHelpText(): string {
  return `${buildRootProgram().helpInformation()}
Examples:
  hedlis list-profiles
  hedlis import-cookies --browser chrome --url https://instagram.com --chrome-profile "Profile 2"
  hedlis run
  hedlis run -w --cookies-from-browser chrome --cookie-url https://x.com

Storage:
  hedlis keeps cookies and the pinned OpenCLI extension under ~/.config/hedlis/
`;
}
