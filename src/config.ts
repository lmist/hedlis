import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BrowserEngine = "playwright" | "patchright";

export type HedlisConfig = {
  engine?: BrowserEngine;
};

export const DEFAULT_ENGINE: BrowserEngine = "playwright";

export function parseEngine(value: string): BrowserEngine {
  if (value !== "playwright" && value !== "patchright") {
    throw new Error(`unsupported engine: ${value}`);
  }

  return value;
}

export function configFilePath({
  env = process.env,
  homedir = os.homedir(),
}: {
  env?: NodeJS.ProcessEnv;
  homedir?: string;
} = {}): string {
  const configHome =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim().length > 0
      ? env.XDG_CONFIG_HOME
      : path.join(homedir, ".config");

  return path.join(configHome, "hedlis", "config.toml");
}

export function readConfig(filePath: string): HedlisConfig {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const config: HedlisConfig = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^engine\s*=\s*"([^"]+)"$/.exec(trimmed);
    if (match) {
      config.engine = parseEngine(match[1]);
      continue;
    }

    throw new Error(`Invalid config line in ${filePath}: ${line}`);
  }

  return config;
}

export function writeConfig(filePath: string, config: HedlisConfig): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const lines: string[] = [];
  if (config.engine) {
    lines.push(`engine = "${config.engine}"`);
  }

  fs.writeFileSync(filePath, lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

export function resolveEngine({
  cliEngine,
  config,
}: {
  cliEngine?: BrowserEngine;
  config?: HedlisConfig;
}): BrowserEngine {
  return cliEngine ?? config?.engine ?? DEFAULT_ENGINE;
}
