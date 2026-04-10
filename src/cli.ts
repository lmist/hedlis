import yargs, { type Argv, type ArgumentsCamelCase } from "yargs"
import { formatHeading } from "./output.js"

type HelpMode = {
  mode: "help";
  text: string;
};

export type RunModeConfig = {
  mode: "run";
  headless: boolean;
  daemon: boolean;
  persistCookies: boolean;
  consent: boolean;
  profile?: string;
  cookieUrls: string[];
};

type StopMode = {
  mode: "stop";
};

type RestartMode = {
  mode: "restart";
};

type InspectMode = {
  mode: "inspect";
};

type StateDisplayMode = {
  mode: "state-display";
};

type StateDestroyMode = {
  mode: "state-destroy";
};

type ListProfilesMode = {
  mode: "list-profiles";
};

type ProfilesStatusMode = {
  mode: "profiles-status";
};

type ProfilesSetDefaultMode = {
  mode: "profiles-set-default";
  profile: string;
  consent: boolean;
};

type CookiesListMode = {
  mode: "cookies-list";
  limit: number;
  noPager: boolean;
  consent: boolean;
};

type CliConfig =
  | HelpMode
  | RunModeConfig
  | StopMode
  | RestartMode
  | InspectMode
  | StateDisplayMode
  | StateDestroyMode
  | ListProfilesMode
  | ProfilesStatusMode
  | ProfilesSetDefaultMode
  | CookiesListMode

function parseUrl(value: string): string {
  try {
    const parsed = new URL(value)

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`invalid site URL: ${value}`)
    }

    return parsed.toString()
  } catch {
    throw new Error(`invalid URL: ${value}`)
  }
}

function normalizeUrls(values: string | string[] | undefined): string[] {
  if (!values) {
    return []
  }

  const urls = Array.isArray(values) ? values : [values]
  const normalized = urls.map(parseUrl)

  return [...new Set(normalized)]
}

function parseLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--limit must be a positive integer")
  }

  return value
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
        throw error
      }

      throw new Error(message)
    })
}

function rootEpilog(): string {
  return `${formatHeading("Examples:")}
  cloak profiles list
  cloak profiles set default "Profile 7"
  cloak cookies list
  cloak run
  cloak run --persist-cookies --consent --cookie-url https://x.com
  cloak run --profile "Profile 7" --persist-cookies --consent --cookie-url https://x.com
  cloak run --daemon
  cloak inspect
  cloak stop
  cloak state display
  cloak state destroy

${formatHeading("Storage:")}
  cloak stores state in ~/.config/cloak/state.sqlite
  cloak caches the pinned OpenCLI extension under ~/.cache/cloak/
`
}

function buildRootProgram(args: string[] = []): Argv {
  return createParser(args, "cloak")
    .usage("$0 <command>")
    .command("run", "launch Patchright headless by default")
    .command("stop", "stop the cloak daemon")
    .command("restart", "restart the cloak daemon")
    .command("inspect", "inspect the cloak daemon")
    .command("state", "inspect or destroy cloak state")
    .command("profiles", "manage Chrome profiles")
    .command("cookies", "list Chrome cookie URLs")
    .epilog(rootEpilog())
}

function rootHelpText(): string {
  return `Usage: cloak <command>

Commands:
  cloak run                          launch Patchright headless by default
  cloak stop                         stop the cloak daemon
  cloak restart                      restart the cloak daemon
  cloak inspect                      inspect the cloak daemon
  cloak state display                show the cloak state paths
  cloak state destroy                destroy cloak state after confirmation
  cloak profiles list                list available Chrome profiles
  cloak profiles status              show the saved default Chrome profile
  cloak profiles set default <name>  save the default Chrome profile
  cloak cookies list                 list Chrome cookie URLs for the default profile

Options:
  -h, --help                         Show help

${rootEpilog()}`
}

function runEpilog(): string {
  return `${formatHeading("Examples:")}
  cloak run
  cloak run --window
  cloak run --daemon
  cloak run --cookie-url https://x.com --profile "Profile 7"
  cloak run --persist-cookies --consent --cookie-url https://x.com

${formatHeading("Storage:")}
  --persist-cookies remembers cookie URLs for the chosen profile
`
}

function buildRunProgram(args: string[] = []): Argv {
  return createParser(args, "cloak run")
    .usage("$0 [options]")
    .option("window", {
      alias: "w",
      type: "boolean",
      description: "open a visible browser window",
    })
    .option("daemon", {
      alias: "d",
      type: "boolean",
      description: "run in the background and manage it with stop/restart/inspect",
    })
    .option("profile", {
      type: "string",
      description: "Chrome profile directory name",
    })
    .option("cookie-url", {
      type: "string",
      array: true,
      description: "HTTP(S) site URL to import cookies from",
      coerce: normalizeUrls,
    })
    .option("persist-cookies", {
      type: "boolean",
      description: "remember the provided --cookie-url values for this profile",
    })
    .option("consent", {
      type: "boolean",
      description: "create ~/.config/cloak without prompting",
    })
    .check((options: ArgumentsCamelCase<Record<string, unknown>>) => {
      const cookieUrls = Array.isArray(options.cookieUrl)
        ? (options.cookieUrl as string[])
        : []

      if (options.persistCookies && cookieUrls.length === 0) {
        throw new Error("--persist-cookies requires at least one --cookie-url")
      }

      return true
    })
    .epilog(runEpilog())
}

function runHelpText(): string {
  return `Usage: cloak run [options]

Options:
  -h, --help               Show help
  -w, --window             open a visible browser window
  -d, --daemon             run in the background
  --profile <profile>      Chrome profile directory name
  --cookie-url <url>       HTTP(S) site URL to import cookies from
  --persist-cookies        remember the provided --cookie-url values
  --consent                create ~/.config/cloak without prompting

${runEpilog()}`
}

function buildProfilesProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles")
    .usage("$0 <command>")
    .command("list", "list available Chrome profiles")
    .command("status", "show the saved default Chrome profile")
    .command("set default <profile>", "save the default Chrome profile")
}

function buildStateProgram(args: string[] = []): Argv {
  return createParser(args, "cloak state")
    .usage("$0 <command>")
    .command("display", "show the cloak state paths")
    .command("destroy", "destroy cloak state after confirmation")
}

function stateHelpText(): string {
  return `Usage: cloak state <command>

Commands:
  cloak state display  show the cloak state paths
  cloak state destroy  destroy cloak state after confirmation

Options:
  -h, --help           Show help
`
}

function buildStateDisplayProgram(args: string[] = []): Argv {
  return createParser(args, "cloak state display").usage("$0")
}

function stateDisplayHelpText(): string {
  return `Usage: cloak state display

Options:
  -h, --help  Show help
`
}

function buildStateDestroyProgram(args: string[] = []): Argv {
  return createParser(args, "cloak state destroy").usage("$0")
}

function stateDestroyHelpText(): string {
  return `Usage: cloak state destroy

Options:
  -h, --help  Show help
`
}

function profilesHelpText(): string {
  return `Usage: cloak profiles <command>

Commands:
  cloak profiles list                list available Chrome profiles
  cloak profiles status              show the saved default Chrome profile
  cloak profiles set default <name>  save the default Chrome profile

Options:
  -h, --help                         Show help
`
}

function buildListProfilesProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles list").usage("$0")
}

function listProfilesHelpText(): string {
  return `Usage: cloak profiles list

Options:
  -h, --help  Show help
`
}

function buildProfilesStatusProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles status").usage("$0")
}

function profilesStatusHelpText(): string {
  return `Usage: cloak profiles status

Options:
  -h, --help  Show help
`
}

function buildProfilesSetDefaultProgram(args: string[] = []): Argv {
  return createParser(args, "cloak profiles set default")
    .usage("$0 <profile> [options]")
    .option("consent", {
      type: "boolean",
      description: "create ~/.config/cloak without prompting",
    })
}

function profilesSetDefaultHelpText(): string {
  return `Usage: cloak profiles set default <profile> [options]

Options:
  -h, --help     Show help
  --consent      create ~/.config/cloak without prompting
`
}

function buildCookiesProgram(args: string[] = []): Argv {
  return createParser(args, "cloak cookies")
    .usage("$0 <command>")
    .command("list", "list Chrome cookie URLs for the default profile")
}

function cookiesHelpText(): string {
  return `Usage: cloak cookies <command>

Commands:
  cloak cookies list  list Chrome cookie URLs for the default profile

Options:
  -h, --help          Show help
`
}

function buildCookiesListProgram(args: string[] = []): Argv {
  return createParser(args, "cloak cookies list")
    .usage("$0 [options]")
    .option("pager", {
      type: "boolean",
      default: true,
      description: "prompt for interactive selection after printing the list",
    })
    .option("limit", {
      alias: "l",
      type: "number",
      default: 100,
      description: "maximum number of URLs to print",
      coerce: parseLimit,
    })
    .option("consent", {
      type: "boolean",
      description: "create ~/.config/cloak without prompting",
    })
}

function cookiesListHelpText(): string {
  return `Usage: cloak cookies list [options]

Options:
  -h, --help           Show help
  -n, --no-pager       print without prompting for selection
  -l, --limit <count>  maximum number of URLs to print (default 100)
  --consent            create ~/.config/cloak without prompting
`
}

function parseRunMode(args: string[]): CliConfig {
  const parser = buildRunProgram(args)
  const options = parser.parseSync() as {
    help?: boolean;
    window?: boolean;
    daemon?: boolean;
    profile?: string;
    cookieUrl?: string[];
    persistCookies?: boolean;
    consent?: boolean;
  }

  if (options.help) {
    return {
      mode: "help",
      text: runHelpText(),
    }
  }

  return {
    mode: "run",
    headless: !Boolean(options.window),
    daemon: Boolean(options.daemon),
    persistCookies: Boolean(options.persistCookies),
    consent: Boolean(options.consent),
    profile: options.profile,
    cookieUrls: options.cookieUrl ?? [],
  }
}

function parseProfilesSetDefaultMode(args: string[]): CliConfig {
  const profile = String(args[0] ?? "").trim()

  if (!profile) {
    throw new Error("profile is required")
  }

  const parser = buildProfilesSetDefaultProgram(args.slice(1))
  const options = parser.parseSync() as {
    help?: boolean;
    consent?: boolean;
  }

  if (options.help) {
    return {
      mode: "help",
      text: profilesSetDefaultHelpText(),
    }
  }

  return {
    mode: "profiles-set-default",
    profile,
    consent: Boolean(options.consent),
  }
}

function parseCookiesListMode(args: string[]): CliConfig {
  const normalizedArgs = args.map((arg) => (arg === "-n" ? "--no-pager" : arg))
  const parser = buildCookiesListProgram(normalizedArgs)
  const options = parser.parseSync() as {
    help?: boolean;
    pager?: boolean;
    limit?: number;
    consent?: boolean;
  }

  if (options.help) {
    return {
      mode: "help",
      text: cookiesListHelpText(),
    }
  }

  return {
    mode: "cookies-list",
    limit: options.limit ?? 100,
    noPager: options.pager === false,
    consent: Boolean(options.consent),
  }
}

function parseRootMode(args: string[]): never {
  buildRootProgram(args).parseSync()
  throw new Error("root mode parsing should not return")
}

export function parseCli(argv: string[]): CliConfig {
  const args = argv.slice(2)

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    return {
      mode: "help",
      text: rootHelpText(),
    }
  }

  if (args[0] === "run") {
    if (args.length === 2 && (args[1] === "-h" || args[1] === "--help")) {
      return {
        mode: "help",
        text: runHelpText(),
      }
    }

    return parseRunMode(args.slice(1))
  }

  if (args[0] === "stop") {
    return { mode: "stop" }
  }

  if (args[0] === "restart") {
    return { mode: "restart" }
  }

  if (args[0] === "inspect") {
    return { mode: "inspect" }
  }

  if (args[0] === "state") {
    if (args.length === 1 || args[1] === "-h" || args[1] === "--help") {
      return {
        mode: "help",
        text: stateHelpText(),
      }
    }

    if (args[1] === "display") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: stateDisplayHelpText(),
        }
      }

      buildStateDisplayProgram(args.slice(2)).parseSync()
      return { mode: "state-display" }
    }

    if (args[1] === "destroy") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: stateDestroyHelpText(),
        }
      }

      buildStateDestroyProgram(args.slice(2)).parseSync()
      return { mode: "state-destroy" }
    }

    buildStateProgram(args.slice(1)).parseSync()
    throw new Error("state parsing should not return")
  }

  if (args[0] === "profiles") {
    if (args.length === 1 || args[1] === "-h" || args[1] === "--help") {
      return {
        mode: "help",
        text: profilesHelpText(),
      }
    }

    if (args[1] === "list") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: listProfilesHelpText(),
        }
      }

      buildListProfilesProgram(args.slice(2)).parseSync()
      return { mode: "list-profiles" }
    }

    if (args[1] === "status") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: profilesStatusHelpText(),
        }
      }

      buildProfilesStatusProgram(args.slice(2)).parseSync()
      return { mode: "profiles-status" }
    }

    if (args[1] === "set") {
      if (args[2] === "default") {
        if (args.length === 4 && (args[3] === "-h" || args[3] === "--help")) {
          return {
            mode: "help",
            text: profilesSetDefaultHelpText(),
          }
        }

        return parseProfilesSetDefaultMode(args.slice(3))
      }
    }

    buildProfilesProgram(args.slice(1)).parseSync()
    throw new Error("profiles parsing should not return")
  }

  if (args[0] === "cookies") {
    if (args.length === 1 || args[1] === "-h" || args[1] === "--help") {
      return {
        mode: "help",
        text: cookiesHelpText(),
      }
    }

    if (args[1] === "list") {
      if (args.length === 3 && (args[2] === "-h" || args[2] === "--help")) {
        return {
          mode: "help",
          text: cookiesListHelpText(),
        }
      }

      return parseCookiesListMode(args.slice(2))
    }

    buildCookiesProgram(args.slice(1)).parseSync()
    throw new Error("cookies parsing should not return")
  }

  return parseRootMode(args)
}

export function isHeadlessEnabled(argv: string[]): boolean {
  const parsed = parseCli(argv)
  return parsed.mode === "run" ? parsed.headless : false
}
