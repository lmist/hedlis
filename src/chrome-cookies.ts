import { normalizeCookie, type Cookie } from "./cookies.js";

export const CHROME_COOKIE_LIMITATION_WARNING =
  "Known limitation: Chrome cookie extraction may collapse same-name cookies across different paths or subdomains before cloak sees them. If imported/runtime cookies look incomplete or login still fails, this may be the cause.";
export const CHROME_COOKIE_SUPPORT_MISSING_ERROR =
  "Chrome cookie support is not available in this install. Reinstall cloak in an environment where optional native dependencies can be installed, or run cloak without --cookie-url.";

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

export function coerceChromeCookieSupportError(error: unknown): Error | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "MODULE_NOT_FOUND"
  ) {
    return new Error(CHROME_COOKIE_SUPPORT_MISSING_ERROR);
  }

  return undefined;
}

function loadChromeCookieReader(): ChromeCookieReader {
  let chromeCookiesSecure: {
    getCookiesPromised?: ChromeCookieReader;
  };

  try {
    chromeCookiesSecure = require("chrome-cookies-secure") as {
      getCookiesPromised?: ChromeCookieReader;
    };
  } catch (error) {
    const supportError = coerceChromeCookieSupportError(error);
    if (supportError) {
      throw supportError;
    }

    throw error;
  }

  if (!chromeCookiesSecure.getCookiesPromised) {
    throw new Error("chrome-cookies-secure does not expose getCookiesPromised");
  }

  return chromeCookiesSecure.getCookiesPromised;
}
