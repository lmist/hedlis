import childProcess from "node:child_process";
import fs from "node:fs";
import type { StoredRunCommand } from "./state-db.js";

type SpawnedProcess = {
  pid?: number;
  unref(): void;
};

type SpawnOptions = {
  execPath: string;
  execArgv: string[];
  scriptPath: string;
  command: StoredRunCommand;
  logPath: string;
  spawnProcess?: typeof childProcess.spawn;
  openFile?: (path: string, flags: string) => number;
};

type StopProcessDependencies = {
  killProcess?: (pid: number, signal?: NodeJS.Signals | number) => void;
  isProcessRunning?: (pid: number) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
};

export function buildRunArguments(command: StoredRunCommand): string[] {
  const args = ["run"];

  if (!command.headless) {
    args.push("--window");
  }

  if (command.profile) {
    args.push("--profile", command.profile);
  }

  for (const url of command.cookieUrls) {
    args.push("--cookie-url", url);
  }

  return args;
}

export function spawnDaemonProcess(options: SpawnOptions): number {
  const spawnProcess = options.spawnProcess ?? childProcess.spawn;
  const openFile = options.openFile ?? fs.openSync;
  const logFd = openFile(options.logPath, "a");
  const child = spawnProcess(
    options.execPath,
    [
      ...options.execArgv,
      options.scriptPath,
      ...buildRunArguments(options.command),
    ],
    {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    }
  ) as SpawnedProcess;

  child.unref();

  if (typeof child.pid !== "number") {
    throw new Error("Failed to start cloak daemon.");
  }

  return child.pid;
}

export function isProcessRunning(
  pid: number,
  killProcess: (pid: number, signal?: NodeJS.Signals | number) => void = process.kill
): boolean {
  try {
    killProcess(pid, 0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ESRCH"
    ) {
      return false;
    }

    throw error;
  }
}

export async function stopProcess(
  pid: number,
  dependencies: StopProcessDependencies = {}
): Promise<boolean> {
  const killProcess = dependencies.killProcess ?? process.kill;
  const processIsRunning =
    dependencies.isProcessRunning ?? ((candidatePid: number) => isProcessRunning(candidatePid, killProcess));
  const sleep =
    dependencies.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = dependencies.timeoutMs ?? 5000;
  const intervalMs = dependencies.intervalMs ?? 100;

  if (!processIsRunning(pid)) {
    return false;
  }

  try {
    killProcess(pid, "SIGTERM");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ESRCH"
    ) {
      return false;
    }

    throw error;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!processIsRunning(pid)) {
      return true;
    }

    await sleep(intervalMs);
  }

  if (processIsRunning(pid)) {
    killProcess(pid, "SIGKILL");
  }

  return !processIsRunning(pid);
}
