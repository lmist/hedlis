import yargs, { type Argv, type ArgumentsCamelCase } from "yargs";
import { formatHeading } from "./output.js";

type HelpMode = {
  mode: "help";
  text: string;
};

export type RunModeConfig = {
  mode: "run";
  headless: boolean;
  persistCookies?: boolean;
  browserCookies?: {
    browser: "chrome";
    url?: string;
    profile?: string;
  };
};

type ListProfilesMode = {
  mode: "list-profiles";
};

type CliConfig =
  | HelpMode
  | RunModeConfig
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

function createParser(args: string[], scriptName: string): Argv {
  return yargs(args)
    .scriptName(scriptName)
    .exitProcess(false)
    .help(false)
    .version(false)
    .showHelpOnFail(false)
    .strict()
    .strictCommands()
    .strictOptions()
    .wrap(100)
    .fail((message: string | undefined, error: Error | undefined) => {
      if (error) {
        throw error;
      }

      throw new Error(message);
    });
}

function rootEpilog(): string {
  return `${formatHeading("Examples:")}
  cloak profiles list
  cloak run
  cloak run --cookies-from-browser chrome
  cloak run --cookies-from-browser chrome --persist-cookies
  cloak run -w --cookies-from-browser chrome --cookie-url https://x.com

${formatHeading("Storage:")}
  cloak caches the pinned OpenCLI extension under ~/.cache/cloak/
`;
}

function buildRootProgram(args: string[] = []): Argv {
  return createParser(args, "cloak")
    .usage("$0 <command>")
    .command("run", "launch Patchright headless by default")
    .command("profiles list", "list available Chrome profiles")
    .epilog(rootEpilog());
}

function rootHelpTextInternal(): string {
  return `Usage: cloak <command>

Commands:
  cloak run             launch Patchright headless by default
  cloak profiles list   list available Chrome profiles

Options:
  -h, --help            Show help

${rootEpilog()}`;
}
function buildProfilesProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles")
    .usage("$0 <command>")
    .command("list", "list available Chrome profiles");
}

function runEpilog(): string {
  return `${formatHeading("Examples:")}
  cloak run
  cloak run -w
  cloak run --cookies-from-browser chrome
  cloak run --cookies-from-browser chrome --persist-cookies
  cloak run --cookies-from-browser chrome --cookie-url https://x.com

${formatHeading("Storage:")}
  cloak caches the pinned OpenCLI extension under ~/.cache/cloak/
`;
}

function buildRunProgram(args: string[] = []): Argv {
  return createParser(args, "cloak run")
    .usage("$0 [options]")
    .option("window", {
      alias: "w",
      type: "boolean",
      description: "open a visible browser window",
    })
    .option("cookies-from-browser", {
      type: "string",
      description: "load cookies from Chrome for this run",
      coerce: parseChromeBrowser,
    })
    .option("cookie-url", {
      type: "string",
      description: "HTTP(S) site URL to scope Chrome cookies (optional in TTY mode)",
      coerce: parseUrl,
    })
    .option("chrome-profile", {
      type: "string",
      description: "Chrome profile name",
    })
    .option("persist-cookies", {
      type: "boolean",
      description: "prompt to persist imported Chrome cookies under ~/.config/cloak/cookies/",
    })
    .check((options: ArgumentsCamelCase<Record<string, unknown>>) => {
      if (
        !options.cookiesFromBrowser &&
        (options.cookieUrl || options.chromeProfile || options.persistCookies)
      ) {
        throw new Error(
          "--cookie-url, --chrome-profile, and --persist-cookies require --cookies-from-browser"
        );
      }

      return true;
    })
    .epilog(runEpilog());
}

function runHelpText(): string {
  return `Usage: cloak run [options]

Options:
  -h, --help                          Show help
  -w, --window                        open a visible browser window
  --cookies-from-browser <browser>  load cookies from Chrome for this run
  --cookie-url <url>              HTTP(S) site URL to scope Chrome cookies
  --chrome-profile <profile>      Chrome profile name
  --persist-cookies               prompt to persist imported Chrome cookies

${runEpilog()}`;
}

function buildListProfilesProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles list")
    .usage("$0");
}

function profilesHelpText(): string {
  return `Usage: cloak profiles <command>

Commands:
  cloak profiles list  list available Chrome profiles

Options:
  -h, --help           Show help
`;
}

function listProfilesHelpText(): string {
  return `Usage: cloak profiles list

Options:
  -h, --help  Show help
`;
}

function parseRootMode(args: string[]): never {
  buildRootProgram(args).parseSync();
  throw new Error("root mode parsing should not return");
}

function parseRunMode(args: string[]): CliConfig {
  const parser = buildRunProgram(args);
  const options = parser.parseSync() as {
    help?: boolean;
    window?: boolean;
    cookiesFromBrowser?: "chrome";
    cookieUrl?: string;
    chromeProfile?: string;
    persistCookies?: boolean;
  };

  if (options.help) {
    return {
      mode: "help",
      text: runHelpText(),
    };
  }

  const browserCookies = options.cookiesFromBrowser
    ? {
        browser: options.cookiesFromBrowser,
        ...(options.cookieUrl ? { url: options.cookieUrl } : {}),
        ...(options.chromeProfile ? { profile: options.chromeProfile } : {}),
      }
    : undefined;

  return browserCookies
    ? {
        mode: "run",
        headless: !Boolean(options.window),
        ...(options.persistCookies ? { persistCookies: true } : {}),
        browserCookies,
      }
    : {
        mode: "run",
        headless: !Boolean(options.window),
      };
}

function parseListProfilesMode(args: string[]): CliConfig {
  const parser = buildListProfilesProgram(args);
  const options = parser.parseSync() as {
    help?: boolean;
  };

  if (options.help) {
    return {
      mode: "help",
      text: listProfilesHelpText(),
    };
  }

  return { mode: "list-profiles" };
}

export function parseCli(argv: string[]): CliConfig {
  const args = argv.slice(2);

  if (args.length === 0) {
    return {
      mode: "help",
      text: rootHelpText(),
    };
  }

  if (args[0] === "-h" || args[0] === "--help") {
    return {
      mode: "help",
      text: rootHelpText(),
    };
  }

  if (args[0] === "run") {
    if (args.length === 2 && (args[1] === "-h" || args[1] === "--help")) {
      return {
        mode: "help",
        text: runHelpText(),
      };
    }

    return parseRunMode(args.slice(1));
  }

  if (args[0] === "profiles") {
    if (args.length === 1 || args[1] === "-h" || args[1] === "--help") {
      return {
        mode: "help",
        text: profilesHelpText(),
      };
    }

    if (args[1] === "list") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: listProfilesHelpText(),
        };
      }

      return parseListProfilesMode(args.slice(2));
    }

    buildProfilesProgram(args.slice(1)).parseSync();
    throw new Error("profiles parsing should not return");
  }

  return parseRootMode(args);
}

export function isHeadlessEnabled(argv: string[]): boolean {
  const parsed = parseCli(argv);
  return parsed.mode === "run" ? parsed.headless : false;
}

function rootHelpText(): string {
  return rootHelpTextInternal();
}
