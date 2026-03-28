import path from "node:path";
import { normalizeCookie, type Cookie } from "./cookies.js";

export const CHROME_COOKIE_LIMITATION_WARNING =
  "Known limitation: Chrome cookie extraction may collapse same-name cookies across different paths or subdomains before hedlis sees them. If imported/runtime cookies look incomplete or login still fails, this may be the cause.";

type ChromePuppeteerCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  HttpOnly?: boolean;
  Secure?: boolean;
  sameSite?: string;
};

type ChromeCookieReader = (
  url: string,
  format: "puppeteer",
  profile?: string
) => Promise<ChromePuppeteerCookie[]>;

const CHROMIUM_EPOCH_MICROSECONDS = 11644473600000000;

function chromiumTimestampToUnixSeconds(timestamp: number): number {
  return Math.trunc((timestamp - CHROMIUM_EPOCH_MICROSECONDS) / 1000000);
}

export function defaultCookieOutputPath(
  url: string,
  cookiesDir: string
): string {
  return path.join(cookiesDir, `${new URL(url).hostname.toLowerCase()}.json`);
}

function normalizeChromeCookie(raw: ChromePuppeteerCookie): Cookie {
  const normalized = {
    name: raw.name,
    value: raw.value,
    domain: raw.domain,
    path: raw.path,
    httpOnly: raw.HttpOnly,
    secure: raw.Secure,
    sameSite: raw.sameSite,
  } as Parameters<typeof normalizeCookie>[0] & { expires?: number };

  if (raw.expires !== 0) {
    normalized.expires = chromiumTimestampToUnixSeconds(raw.expires);
  }

  return normalizeCookie(normalized);
}

export async function readChromeCookies(
  options: { url: string; profile?: string },
  getCookies: ChromeCookieReader = loadChromeCookieReader()
): Promise<Cookie[]> {
  const cookies = await getCookies(options.url, "puppeteer", options.profile);
  return cookies.map(normalizeChromeCookie);
}

function loadChromeCookieReader(): ChromeCookieReader {
  const chromeCookiesSecure = require("chrome-cookies-secure") as {
    getCookiesPromised?: ChromeCookieReader;
  };

  if (!chromeCookiesSecure.getCookiesPromised) {
    throw new Error("chrome-cookies-secure does not expose getCookiesPromised");
  }

  return chromeCookiesSecure.getCookiesPromised;
}
