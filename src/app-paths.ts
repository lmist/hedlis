import os from "node:os";
import path from "node:path";

export type AppPaths = {
  extensionsDir: string;
  cookiesDir: string;
};

export function defaultAppRootDir(
  dependencies: {
    homedir?: () => string;
  } = {}
): string {
  const homedir = dependencies.homedir ?? os.homedir;
  return path.join(homedir(), ".cache", "cloak");
}

export function defaultConfigRootDir(
  dependencies: {
    homedir?: () => string;
  } = {}
): string {
  const homedir = dependencies.homedir ?? os.homedir;
  return path.join(homedir(), ".config", "cloak");
}

export function resolveAppPaths(
  rootDir: string = defaultAppRootDir(),
  configDir: string = defaultConfigRootDir()
): AppPaths {
  return {
    extensionsDir: rootDir,
    cookiesDir: path.join(configDir, "cookies"),
  };
}
