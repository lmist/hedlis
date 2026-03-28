import fs from "node:fs";
import path from "node:path";
import { resolveAppPaths } from "./app-paths.js";
import {
  CHROME_COOKIE_LIMITATION_WARNING,
  defaultCookieOutputPath,
  readChromeCookies,
} from "./chrome-cookies.js";

export type ImportCookiesCommandOptions = {
  url: string;
  profile?: string;
  output?: string;
  cwd?: string;
  cookiesDir?: string;
};

type ReadChromeCookies = typeof readChromeCookies;

export async function importCookiesCommand(
  options: ImportCookiesCommandOptions,
  dependencies: {
    readChromeCookies?: ReadChromeCookies;
    warn?: (message: string) => void;
  } = {}
): Promise<{ count: number; outputPath: string }> {
  const readCookies = dependencies.readChromeCookies ?? readChromeCookies;
  const warn = dependencies.warn ?? console.warn;
  const cookies = await readCookies({
    url: options.url,
    profile: options.profile,
  });

  if (cookies.length === 0) {
    throw new Error(`No cookies found for ${options.url}`);
  }

  warn(CHROME_COOKIE_LIMITATION_WARNING);

  const cookiesDir = options.cookiesDir ?? resolveAppPaths().cookiesDir;
  const cwd = options.cwd ?? process.cwd();
  const outputPath = options.output
    ? path.resolve(cwd, options.output)
    : defaultCookieOutputPath(options.url, cookiesDir);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cookies, null, 2));

  return {
    count: cookies.length,
    outputPath,
  };
}
