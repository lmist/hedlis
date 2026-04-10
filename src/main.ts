#!/usr/bin/env node
import { chromium as patchrightChromium } from "patchright"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "node:readline/promises"
import { resolveAppPaths, type AppPaths } from "./app-paths.js"
import { buildRunArguments, isProcessRunning, spawnDaemonProcess, stopProcess } from "./daemon.js"
import { prepareRequiredExtension } from "./extension.js"
import type { Cookie } from "./cookies.js"
import { parseCli, type RunModeConfig } from "./cli.js"
import {
  CHROME_COOKIE_LIMITATION_WARNING,
  readChromeCookies,
} from "./chrome-cookies.js"
import {
  listChromeProfileCookieUrls,
} from "./chrome-profile-sites.js"
import {
  hasChromeUserDataDir,
  listChromeProfiles,
  type ChromeProfile,
} from "./chrome-profiles.js"
import {
  CloakStateDb,
  type DaemonState,
  type StoredRunCommand,
} from "./state-db.js"
import { formatError, formatInfo, formatSuccess, formatWarning } from "./output.js"

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

type SelectCookieUrlsOptions = {
  profile: string;
  urls: string[];
};

type MainDependencies = ResolveStartupCookiesDependencies & {
  appPaths?: AppPaths;
  createStateDb?: (dbPath: string) => CloakStateDb;
  confirmCreateConfigDir?: (configDir: string) => Promise<boolean>;
  confirmDestroyState?: (configDir: string) => Promise<boolean>;
  selectCookieUrls?: (
    options: SelectCookieUrlsOptions
  ) => Promise<string[] | undefined>;
  prepareRequiredExtension?: typeof prepareRequiredExtension;
  listChromeProfiles?: typeof listChromeProfiles;
  hasChromeUserDataDir?: typeof hasChromeUserDataDir;
  listChromeProfileCookieUrls?: typeof listChromeProfileCookieUrls;
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
  removeDir?: (path: string, options: { recursive: true; force: true }) => void;
  writeFile?: (path: string, data: string) => void;
  pathExists?: (path: string) => boolean;
  writeStdout?: (message: string) => void;
  log?: (message: string) => void;
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  processExecPath?: string;
  processExecArgv?: string[];
  scriptPath?: string;
  spawnDaemonProcess?: typeof spawnDaemonProcess;
  isProcessRunning?: typeof isProcessRunning;
  stopProcess?: typeof stopProcess;
  now?: () => Date;
};

type ResolvedRunConfig = {
  headless: boolean;
  daemon: boolean;
  profile?: string;
  cookieUrls: string[];
  explicitCookieUrls: string[];
  persistCookies: boolean;
};

export function dedupeCookies(cookies: Cookie[]): Cookie[] {
  const seen = new Map<string, Cookie>()

  for (const cookie of cookies) {
    const key = [cookie.name, cookie.domain, cookie.path].join("\u0000")
    seen.set(key, cookie)
  }

  return [...seen.values()]
}

export function parseSelectionInput(
  input: string,
  total: number
): number[] | undefined {
  const normalized = input.trim().toLowerCase()

  if (normalized.length === 0) {
    return undefined
  }

  if (normalized === "all" || normalized === "a" || normalized === "*") {
    return Array.from({ length: total }, (_, index) => index)
  }

  if (normalized === "none" || normalized === "n" || normalized === "clear") {
    return []
  }

  const indexes = new Set<number>()

  for (const part of normalized.split(",")) {
    const token = part.trim()

    if (!token) {
      continue
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/)

    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])

      if (start < 1 || end < 1 || start > total || end > total) {
        throw new Error("selection is out of range")
      }

      const lower = Math.min(start, end)
      const upper = Math.max(start, end)

      for (let value = lower; value <= upper; value += 1) {
        indexes.add(value - 1)
      }

      continue
    }

    if (!/^\d+$/.test(token)) {
      throw new Error("selection must use indexes, ranges, all, or none")
    }

    const value = Number(token)

    if (value < 1 || value > total) {
      throw new Error("selection is out of range")
    }

    indexes.add(value - 1)
  }

  return [...indexes].sort((left, right) => left - right)
}

export async function resolveStartupCookies(
  options: {
    cookieUrls: string[];
    profile?: string;
  },
  dependencies: ResolveStartupCookiesDependencies = {}
): Promise<Cookie[]> {
  if (options.cookieUrls.length === 0) {
    return []
  }

  const readChromeCookiesFn =
    dependencies.readChromeCookies ?? readChromeCookies
  const warn =
    dependencies.warn ??
    ((message: string) => console.warn(formatWarning(message)))
  const importedCookies: Cookie[] = []

  for (const url of options.cookieUrls) {
    const cookies = await readChromeCookiesFn({
      url,
      profile: options.profile,
    })

    if (cookies.length === 0) {
      throw new Error(`No cookies found for ${url}`)
    }

    importedCookies.push(...cookies)
  }

  warn(CHROME_COOKIE_LIMITATION_WARNING)

  return dedupeCookies(importedCookies)
}

export async function main(
  argv: string[] = process.argv,
  dependencies: MainDependencies = {}
) {
  const cli = parseCli(argv)
  const appPaths = dependencies.appPaths ?? resolveAppPaths()
  const writeStdout =
    dependencies.writeStdout ??
    ((message: string) => process.stdout.write(message))
  const log = dependencies.log ?? ((message: string) => console.log(message))

  if (cli.mode === "help") {
    writeStdout(cli.text)
    return
  }

  if (cli.mode === "list-profiles") {
    await handleListProfiles(log, dependencies)
    return
  }

  if (cli.mode === "profiles-status") {
    const stateDb = loadExistingStateDb(appPaths, dependencies)
    const profile = stateDb?.getDefaultProfile()

    if (!profile) {
      log("No default profile selected. Use `cloak profiles set default <profile>`.")
      return
    }

    log(`Current active profile: ${profile}`)
    return
  }

  if (cli.mode === "profiles-set-default") {
    const stateDb = await ensureStateDb(appPaths, cli.consent, dependencies)

    if (!stateDb) {
      log(formatInfo("Aborted."))
      return
    }

    const profile = await resolveChromeProfile(cli.profile, dependencies)
    stateDb.setDefaultProfile(profile.directory)
    log(formatSuccess(`Saved default profile: ${profile.directory}`))
    return
  }

  if (cli.mode === "cookies-list") {
    await handleCookiesList(cli, appPaths, log, dependencies)
    return
  }

  if (cli.mode === "inspect") {
    handleInspect(appPaths, log, dependencies)
    return
  }

  if (cli.mode === "state-display") {
    handleStateDisplay(appPaths, log, dependencies)
    return
  }

  if (cli.mode === "state-destroy") {
    await handleStateDestroy(appPaths, log, dependencies)
    return
  }

  if (cli.mode === "stop") {
    await handleStop(appPaths, log, dependencies)
    return
  }

  if (cli.mode === "restart") {
    await handleRestart(appPaths, log, dependencies)
    return
  }

  const resolvedCli = await resolveRunConfig(cli, appPaths, dependencies)
  const runSummary = formatRunSettings(resolvedCli)
  log(runSummary)

  if (resolvedCli.daemon) {
    await handleDaemonRun(resolvedCli, appPaths, log, dependencies)
    return
  }

  const cookies = await resolveStartupCookies(resolvedCli, dependencies)
  await rememberCookieUrls(resolvedCli, appPaths, log, dependencies)
  await launchBrowser(resolvedCli, cookies, appPaths, dependencies)
}

async function handleListProfiles(
  log: (message: string) => void,
  dependencies: Pick<MainDependencies, "hasChromeUserDataDir" | "listChromeProfiles">
) {
  const hasChrome =
    dependencies.hasChromeUserDataDir ?? hasChromeUserDataDir

  if (!hasChrome()) {
    log("No Chrome data directory detected on this machine.")
    return
  }

  const listProfiles = dependencies.listChromeProfiles ?? listChromeProfiles
  const profiles = listProfiles()

  if (profiles.length === 0) {
    log("Listing profiles for Chrome\n(no profiles found)")
    return
  }

  const lines = ["Listing profiles for Chrome"]

  for (const profile of profiles) {
    lines.push(`- ${profile.directory}`)
  }

  log(lines.join("\n"))
}

async function handleCookiesList(
  cli: { limit: number; noPager: boolean; consent: boolean },
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: MainDependencies
) {
  const stateDb = loadExistingStateDb(appPaths, dependencies)
  const profile = stateDb?.getDefaultProfile()

  if (!profile) {
    throw new Error("No default profile selected. Use `cloak profiles set default <profile>`.")
  }

  await resolveChromeProfile(profile, dependencies)
  const listCookieUrls =
    dependencies.listChromeProfileCookieUrls ?? listChromeProfileCookieUrls
  const urls = await listCookieUrls({
    profileDirectory: profile,
  })
  const limitedUrls = urls.slice(0, cli.limit)

  if (limitedUrls.length === 0) {
    log(`No cookie URLs found for ${profile}.`)
    return
  }

  const lines = [`Cookie URLs for ${profile}`]

  limitedUrls.forEach((url, index) => {
    lines.push(`${index + 1}. ${url}`)
  })

  log(lines.join("\n"))

  if (cli.noPager || !isInteractiveTerminal(dependencies)) {
    return
  }

  const remembered = await selectCookieUrls(
    {
      profile,
      urls: limitedUrls,
    },
    dependencies
  )

  if (remembered === undefined) {
    return
  }

  const stateDbForWrite = await ensureStateDb(appPaths, cli.consent, dependencies)

  if (!stateDbForWrite) {
    log(formatInfo("Aborted."))
    return
  }

  stateDbForWrite.replaceRememberedCookieUrls(profile, remembered)

  if (remembered.length === 0) {
    log(formatSuccess(`Cleared remembered cookie URLs for ${profile}`))
    return
  }

  log(formatSuccess(`Saved ${remembered.length} cookie URL(s) for ${profile}`))
}

function handleInspect(
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: Pick<MainDependencies, "createStateDb" | "pathExists" | "isProcessRunning">
) {
  const stateDb = loadExistingStateDb(appPaths, dependencies)
  const daemon = stateDb?.getDaemonState()

  if (!daemon) {
    log("No cloak daemon running.")
    return
  }

  const processIsRunning =
    dependencies.isProcessRunning ?? isProcessRunning

  if (!processIsRunning(daemon.pid)) {
    stateDb?.clearDaemonState()
    log(`Recorded daemon pid ${daemon.pid} is not running. Cleared stale state.`)
    return
  }

  log(formatDaemonState(daemon))
}

function handleStateDisplay(
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: Pick<
    MainDependencies,
    "createStateDb" | "pathExists" | "isProcessRunning"
  >
) {
  const pathExists = dependencies.pathExists ?? fs.existsSync
  const stateDbExists = pathExists(appPaths.stateDbPath)
  const daemonLogExists = pathExists(appPaths.daemonLogPath)
  const stateDb = stateDbExists ? loadExistingStateDb(appPaths, dependencies) : undefined
  const defaultProfile = stateDb?.getDefaultProfile()
  const daemon = stateDb?.getDaemonState()
  const processIsRunning = dependencies.isProcessRunning ?? isProcessRunning
  const daemonStatus = !daemon
    ? "(none)"
    : processIsRunning(daemon.pid)
      ? `running (${daemon.pid})`
      : `stale (${daemon.pid})`
  const lines = [
    "cloak state",
    `config dir: ${appPaths.configDir}`,
    `sqlite: ${appPaths.stateDbPath}`,
    `sqlite present: ${stateDbExists ? "yes" : "no"}`,
    `daemon log: ${appPaths.daemonLogPath}`,
    `daemon log present: ${daemonLogExists ? "yes" : "no"}`,
    `default profile: ${defaultProfile ?? "(none)"}`,
    `daemon: ${daemonStatus}`,
  ]

  log(lines.join("\n"))
}

async function handleStop(
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: Pick<
    MainDependencies,
    "createStateDb" | "pathExists" | "isProcessRunning" | "stopProcess"
  >
) {
  const stateDb = loadExistingStateDb(appPaths, dependencies)
  const daemon = stateDb?.getDaemonState()

  if (!daemon) {
    log("No cloak daemon running.")
    return
  }

  const processIsRunning =
    dependencies.isProcessRunning ?? isProcessRunning

  if (!processIsRunning(daemon.pid)) {
    stateDb?.clearDaemonState()
    log(`Recorded daemon pid ${daemon.pid} is not running. Cleared stale state.`)
    return
  }

  const stopProcessFn = dependencies.stopProcess ?? stopProcess
  await stopProcessFn(daemon.pid)
  stateDb?.clearDaemonState()
  log(formatSuccess(`Stopped cloak daemon (${daemon.pid})`))
}

async function handleStateDestroy(
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: Pick<
    MainDependencies,
    | "confirmDestroyState"
    | "createStateDb"
    | "isProcessRunning"
    | "pathExists"
    | "removeDir"
    | "stdinIsTTY"
    | "stdoutIsTTY"
    | "stopProcess"
  >
) {
  const pathExists = dependencies.pathExists ?? fs.existsSync

  if (!pathExists(appPaths.configDir)) {
    log("No cloak state to destroy.")
    return
  }

  if (!isInteractiveTerminal(dependencies)) {
    throw new Error("`cloak state destroy` requires an interactive terminal.")
  }

  const confirmDestroyState =
    dependencies.confirmDestroyState ?? defaultConfirmDestroyState

  if (!(await confirmDestroyState(appPaths.configDir))) {
    log(formatInfo("Aborted."))
    return
  }

  const stateDb = loadExistingStateDb(appPaths, dependencies)
  const daemon = stateDb?.getDaemonState()
  const processIsRunning = dependencies.isProcessRunning ?? isProcessRunning

  if (daemon && processIsRunning(daemon.pid)) {
    const stopProcessFn = dependencies.stopProcess ?? stopProcess
    await stopProcessFn(daemon.pid)
  }

  const removeDir = dependencies.removeDir ?? fs.rmSync
  removeDir(appPaths.configDir, { recursive: true, force: true })
  log(formatSuccess(`Destroyed cloak state under ${appPaths.configDir}`))
}

async function handleRestart(
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: MainDependencies
) {
  const stateDb = loadExistingStateDb(appPaths, dependencies)

  if (!stateDb) {
    throw new Error("No saved daemon command found. Run `cloak run --daemon` first.")
  }

  const currentDaemon = stateDb.getDaemonState()
  const processIsRunning =
    dependencies.isProcessRunning ?? isProcessRunning
  let command = stateDb.getLastDaemonCommand()

  if (currentDaemon) {
    command = {
      headless: currentDaemon.headless,
      profile: currentDaemon.profile,
      cookieUrls: currentDaemon.cookieUrls,
    }

    if (processIsRunning(currentDaemon.pid)) {
      const stopProcessFn = dependencies.stopProcess ?? stopProcess
      await stopProcessFn(currentDaemon.pid)
    }

    stateDb.clearDaemonState()
  }

  if (!command) {
    throw new Error("No saved daemon command found. Run `cloak run --daemon` first.")
  }

  await startDaemon(command, appPaths, log, dependencies)
}

async function resolveRunConfig(
  cli: RunModeConfig,
  appPaths: AppPaths,
  dependencies: MainDependencies
): Promise<ResolvedRunConfig> {
  const stateDb =
    cli.daemon || cli.persistCookies
      ? await ensureStateDb(appPaths, cli.consent, dependencies)
      : loadExistingStateDb(appPaths, dependencies)

  if ((cli.daemon || cli.persistCookies) && !stateDb) {
    throw new Error("Config directory creation was declined.")
  }

  const defaultProfile = cli.profile ?? stateDb?.getDefaultProfile()
  const profile = defaultProfile
    ? (await resolveChromeProfile(defaultProfile, dependencies)).directory
    : undefined
  const explicitCookieUrls = cli.cookieUrls
  const rememberedCookieUrls =
    explicitCookieUrls.length === 0 && profile && stateDb
      ? stateDb.getRememberedCookieUrls(profile)
      : []
  const cookieUrls =
    explicitCookieUrls.length > 0 ? explicitCookieUrls : rememberedCookieUrls

  if ((cookieUrls.length > 0 || cli.persistCookies) && !profile) {
    throw new Error(
      "A Chrome profile is required. Use `cloak profiles set default <profile>` or pass --profile."
    )
  }

  return {
    headless: cli.headless,
    daemon: cli.daemon,
    profile,
    cookieUrls,
    explicitCookieUrls,
    persistCookies: cli.persistCookies,
  }
}

async function handleDaemonRun(
  config: ResolvedRunConfig,
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: MainDependencies
) {
  const stateDb = await ensureStateDb(appPaths, true, dependencies)

  if (!stateDb) {
    throw new Error("Unable to create cloak state.")
  }

  const existing = stateDb.getDaemonState()
  const processIsRunning =
    dependencies.isProcessRunning ?? isProcessRunning

  if (existing) {
    if (processIsRunning(existing.pid)) {
      throw new Error("A cloak daemon is already running. Use `cloak restart` or `cloak stop`.")
    }

    stateDb.clearDaemonState()
  }

  await startDaemon(
    {
      headless: config.headless,
      profile: config.profile,
      cookieUrls: config.cookieUrls,
    },
    appPaths,
    log,
    dependencies
  )
}

async function startDaemon(
  command: StoredRunCommand,
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: MainDependencies
) {
  const stateDb = await ensureStateDb(appPaths, true, dependencies)

  if (!stateDb) {
    throw new Error("Unable to create cloak state.")
  }

  const spawnDaemonProcessFn =
    dependencies.spawnDaemonProcess ?? spawnDaemonProcess
  const makeDir = dependencies.makeDir ?? fs.mkdirSync
  const now = dependencies.now ?? (() => new Date())
  makeDir(appPaths.configDir, { recursive: true })
  const pid = spawnDaemonProcessFn({
    execPath: dependencies.processExecPath ?? process.execPath,
    execArgv: dependencies.processExecArgv ?? process.execArgv,
    scriptPath: dependencies.scriptPath ?? process.argv[1],
    command,
    logPath: appPaths.daemonLogPath,
  })

  stateDb.setLastDaemonCommand(command)
  stateDb.setDaemonState({
    ...command,
    pid,
    startedAt: now().toISOString(),
    logPath: appPaths.daemonLogPath,
  })
  log(formatSuccess(`Started cloak daemon (${pid})`))
}

async function rememberCookieUrls(
  config: ResolvedRunConfig,
  appPaths: AppPaths,
  log: (message: string) => void,
  dependencies: MainDependencies
) {
  if (!config.persistCookies || !config.profile || config.explicitCookieUrls.length === 0) {
    return
  }

  const stateDb = await ensureStateDb(appPaths, true, dependencies)

  if (!stateDb) {
    throw new Error("Unable to create cloak state.")
  }

  const remembered = stateDb.rememberCookieUrls(
    config.profile,
    config.explicitCookieUrls
  )
  log(formatSuccess(`Remembered ${remembered.length} cookie URL(s) for ${config.profile}`))
}

async function launchBrowser(
  config: ResolvedRunConfig,
  cookies: Cookie[],
  appPaths: AppPaths,
  dependencies: MainDependencies
) {
  const prepareExtension =
    dependencies.prepareRequiredExtension ?? prepareRequiredExtension
  const launchPersistentContext =
    dependencies.patchrightLaunchPersistentContext ??
    dependencies.launchPersistentContext ??
    patchrightChromium.launchPersistentContext.bind(patchrightChromium)
  const makeTempDir = dependencies.makeTempDir ?? fs.mkdtempSync
  const makeDir = dependencies.makeDir ?? fs.mkdirSync
  const writeFile = dependencies.writeFile ?? fs.writeFileSync
  const extensionPath = await prepareExtension(appPaths.extensionsDir)
  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ]

  const userDataDir = makeTempDir(path.join(os.tmpdir(), "cloak-profile-"))
  const defaultDir = path.join(userDataDir, "Default")
  makeDir(defaultDir, { recursive: true })
  writeFile(
    path.join(defaultDir, "Preferences"),
    JSON.stringify({
      extensions: { ui: { developer_mode: true } },
    })
  )

  const executablePath =
    dependencies.patchrightExecutablePath ??
    patchrightChromium.executablePath.bind(patchrightChromium)
  const context = await launchPersistentContext(userDataDir, {
    headless: config.headless,
    executablePath: executablePath(),
    args,
  })

  if (cookies.length > 0) {
    await context.addCookies(cookies)
    console.log(formatSuccess(`Injected ${cookies.length} cookies`))
  }

  console.log(formatInfo("Browser running. Ctrl+C to exit."))

  const browser = context.browser()
  let onSigint: (() => void) | undefined
  let onSigterm: (() => void) | undefined
  const handleSignal = () => {
    console.log(formatInfo("\nShutting down..."))
  }

  try {
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) {
          return
        }

        settled = true
        resolve()
      }

      onSigint = () => {
        handleSignal()
        finish()
      }
      onSigterm = () => {
        handleSignal()
        finish()
      }

      context.on("close", finish)
      browser?.on("disconnected", finish)
      process.on("SIGINT", onSigint)
      process.on("SIGTERM", onSigterm)
    })
  } finally {
    if (onSigint) {
      process.removeListener("SIGINT", onSigint)
    }

    if (onSigterm) {
      process.removeListener("SIGTERM", onSigterm)
    }

    loadExistingStateDb(appPaths, dependencies)?.clearDaemonState(process.pid)
  }

  await context.close().catch(() => {})
}

async function resolveChromeProfile(
  profileName: string,
  dependencies: Pick<MainDependencies, "listChromeProfiles">
): Promise<ChromeProfile> {
  const listProfiles = dependencies.listChromeProfiles ?? listChromeProfiles
  const profiles = listProfiles()
  const profile = profiles.find((candidate) => candidate.directory === profileName)

  if (!profile) {
    throw new Error(`Chrome profile not found: ${profileName}`)
  }

  return profile
}

function formatRunSettings(config: ResolvedRunConfig): string {
  const lines = [
    "Running with settings",
    `profile: ${config.profile ?? "(none)"}`,
    "cookie urls:",
  ]

  if (config.cookieUrls.length === 0) {
    lines.push("  (none)")
  } else {
    for (const url of config.cookieUrls) {
      lines.push(`  - ${url}`)
    }
  }

  return lines.join("\n")
}

function formatDaemonState(state: DaemonState): string {
  const lines = [
    "cloak daemon",
    `pid: ${state.pid}`,
    "status: running",
    `profile: ${state.profile ?? "(none)"}`,
    `headless: ${state.headless ? "yes" : "no"}`,
    `started at: ${state.startedAt}`,
    `log: ${state.logPath}`,
    "cookie urls:",
  ]

  if (state.cookieUrls.length === 0) {
    lines.push("  (none)")
  } else {
    for (const url of state.cookieUrls) {
      lines.push(`  - ${url}`)
    }
  }

  return lines.join("\n")
}

function loadExistingStateDb(
  appPaths: AppPaths,
  dependencies: Pick<MainDependencies, "createStateDb" | "pathExists">
): CloakStateDb | undefined {
  const pathExists = dependencies.pathExists ?? fs.existsSync

  if (!pathExists(appPaths.stateDbPath)) {
    return undefined
  }

  const createStateDb = dependencies.createStateDb ?? ((dbPath: string) => new CloakStateDb(dbPath))
  return createStateDb(appPaths.stateDbPath)
}

async function ensureStateDb(
  appPaths: AppPaths,
  consent: boolean,
  dependencies: Pick<
    MainDependencies,
    | "createStateDb"
    | "confirmCreateConfigDir"
    | "makeDir"
    | "pathExists"
    | "stdinIsTTY"
    | "stdoutIsTTY"
  >
): Promise<CloakStateDb | undefined> {
  const pathExists = dependencies.pathExists ?? fs.existsSync
  const existing = loadExistingStateDb(appPaths, dependencies)

  if (existing) {
    return existing
  }

  const makeDir = dependencies.makeDir ?? fs.mkdirSync
  const configDirExists = pathExists(appPaths.configDir)

  if (!configDirExists && !consent) {
    if (!isInteractiveTerminal(dependencies)) {
      throw new Error(
        `Config directory ${appPaths.configDir} does not exist. Re-run with --consent to create it.`
      )
    }

    const confirmCreateConfigDir =
      dependencies.confirmCreateConfigDir ?? defaultConfirmCreateConfigDir

    if (!(await confirmCreateConfigDir(appPaths.configDir))) {
      return undefined
    }
  }

  makeDir(appPaths.configDir, { recursive: true })
  const createStateDb = dependencies.createStateDb ?? ((dbPath: string) => new CloakStateDb(dbPath))
  return createStateDb(appPaths.stateDbPath)
}

function isInteractiveTerminal(
  dependencies: Pick<MainDependencies, "stdinIsTTY" | "stdoutIsTTY">
): boolean {
  const stdinIsTTY = dependencies.stdinIsTTY ?? process.stdin.isTTY ?? false
  const stdoutIsTTY = dependencies.stdoutIsTTY ?? process.stdout.isTTY ?? false
  return stdinIsTTY && stdoutIsTTY
}

async function defaultConfirmCreateConfigDir(configDir: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(`Create ${configDir}? [y/N] `)
    return /^(y|yes)$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

async function defaultConfirmDestroyState(configDir: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(
      `Destroy cloak state under ${configDir}? This cannot be undone. [y/N] `
    )
    return /^(y|yes)$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

async function selectCookieUrls(
  options: SelectCookieUrlsOptions,
  dependencies: Pick<MainDependencies, "selectCookieUrls">
): Promise<string[] | undefined> {
  const promptFn = dependencies.selectCookieUrls ?? defaultSelectCookieUrls
  return promptFn(options)
}

async function defaultSelectCookieUrls(
  options: SelectCookieUrlsOptions
): Promise<string[] | undefined> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    while (true) {
      const answer = await rl.question(
        `Remember URLs for ${options.profile}? [all, none, 1,3-5, Enter to skip] `
      )

      try {
        const indexes = parseSelectionInput(answer, options.urls.length)

        if (indexes === undefined) {
          return undefined
        }

        return indexes.map((index) => options.urls[index])
      } catch (error) {
        console.log(formatWarning(String(error)))
      }
    }
  } finally {
    rl.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(formatError(String(error)))
    process.exit(1)
  })
}

export function daemonCommandToArgs(command: StoredRunCommand): string[] {
  return buildRunArguments(command)
}
