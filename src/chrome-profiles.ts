import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export type ChromeProfile = {
  directory: string;
  name: string;
  accountName?: string;
};

type Dependencies = {
  chromeUserDataDir?: string;
  pathExists?: (path: string) => boolean;
  readdir?: (dir: string) => string[];
  readFile?: (path: string) => string;
};

export function defaultChromeUserDataDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Google", "Chrome");
  }

  if (platform === "win32") {
    return path.join(home, "AppData", "Local", "Google", "Chrome", "User Data");
  }

  // Linux
  return path.join(home, ".config", "google-chrome");
}

function readProfileInfo(
  prefsPath: string,
  readFile: (p: string) => string
): { name: string; accountName?: string } | undefined {
  try {
    const raw = readFile(prefsPath);
    const prefs = JSON.parse(raw);
    const name = prefs?.profile?.name;
    if (name === undefined) return undefined;
    const accountName = prefs?.account_info?.[0]?.full_name || undefined;
    return { name, accountName };
  } catch {
    return undefined;
  }
}

export function listChromeProfiles(dependencies: Dependencies = {}): ChromeProfile[] {
  const userDataDir = dependencies.chromeUserDataDir ?? defaultChromeUserDataDir();
  const readdir = dependencies.readdir ?? ((dir: string) => fs.readdirSync(dir));
  const readFile = dependencies.readFile ?? ((p: string) => fs.readFileSync(p, "utf8"));

  let entries: string[];
  try {
    entries = readdir(userDataDir);
  } catch {
    return [];
  }

  const profiles: ChromeProfile[] = [];

  for (const entry of entries) {
    if (entry !== "Default" && !entry.startsWith("Profile ")) {
      continue;
    }

    const prefsPath = path.join(userDataDir, entry, "Preferences");
    const info = readProfileInfo(prefsPath, readFile);

    if (info !== undefined) {
      profiles.push({
        directory: entry,
        name: info.name,
        ...(info.accountName ? { accountName: info.accountName } : {}),
      });
    }
  }

  profiles.sort((a, b) => a.directory.localeCompare(b.directory));
  return profiles;
}

export function hasChromeUserDataDir(
  dependencies: Pick<Dependencies, "chromeUserDataDir" | "pathExists"> = {}
): boolean {
  const userDataDir = dependencies.chromeUserDataDir ?? defaultChromeUserDataDir();
  const pathExists = dependencies.pathExists ?? fs.existsSync;

  return pathExists(userDataDir);
}
