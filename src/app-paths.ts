import os from "node:os";
import path from "node:path";

export type AppPaths = {
  rootDir: string;
  cookiesDir: string;
  extensionsDir: string;
};

export function defaultAppRootDir(
  dependencies: {
    homedir?: () => string;
  } = {}
): string {
  const homedir = dependencies.homedir ?? os.homedir;
  return path.join(homedir(), ".config", "hedlis");
}

export function resolveAppPaths(rootDir: string = defaultAppRootDir()): AppPaths {
  return {
    rootDir,
    cookiesDir: path.join(rootDir, "cookies"),
    extensionsDir: path.join(rootDir, "extensions"),
  };
}
