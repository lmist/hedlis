import fs from "node:fs";
import path from "node:path";
import {
  defaultCookieOutputPath,
  readChromeCookies,
} from "./chrome-cookies.js";

export type ImportCookiesCommandOptions = {
  url: string;
  profile?: string;
  output?: string;
  outputRoot?: string;
};

type ReadChromeCookies = typeof readChromeCookies;

export async function importCookiesCommand(
  options: ImportCookiesCommandOptions,
  dependencies: {
    readChromeCookies?: ReadChromeCookies;
  } = {}
): Promise<{ count: number; outputPath: string }> {
  const readCookies = dependencies.readChromeCookies ?? readChromeCookies;
  const cookies = await readCookies({
    url: options.url,
    profile: options.profile,
  });

  if (cookies.length === 0) {
    throw new Error(`No cookies found for ${options.url}`);
  }

  const outputRoot = options.outputRoot ?? process.cwd();
  const outputPath = options.output
    ? path.resolve(outputRoot, options.output)
    : defaultCookieOutputPath(options.url, path.join(outputRoot, "cookies"));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cookies, null, 2));

  return {
    count: cookies.length,
    outputPath,
  };
}
