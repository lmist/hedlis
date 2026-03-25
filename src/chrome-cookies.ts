import path from "node:path";
import chrome from "chrome-cookies-secure";
import type { Cookie } from "./cookies.js";

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

export function defaultCookieOutputPath(
  url: string,
  cookiesDir: string
): string {
  return path.join(cookiesDir, `${new URL(url).hostname.toLowerCase()}.json`);
}

function normalizeSameSite(
  sameSite: string | undefined
): Cookie["sameSite"] | undefined {
  if (!sameSite) return undefined;

  switch (sameSite.toLowerCase()) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "none":
    case "no_restriction":
      return "None";
    case "unspecified":
      return undefined;
    default:
      return undefined;
  }
}

function normalizeChromeCookie(raw: ChromePuppeteerCookie): Cookie {
  const cookie: Cookie = {
    name: raw.name,
    value: raw.value,
    domain: raw.domain,
    path: raw.path,
    expires: Math.trunc(raw.expires),
  };

  if (typeof raw.HttpOnly === "boolean") {
    cookie.httpOnly = raw.HttpOnly;
  }

  if (typeof raw.Secure === "boolean") {
    cookie.secure = raw.Secure;
  }

  const sameSite = normalizeSameSite(raw.sameSite);
  if (sameSite) {
    cookie.sameSite = sameSite;
  }

  return cookie;
}

export async function readChromeCookies(
  options: { url: string; profile?: string },
  getCookies: ChromeCookieReader = chrome.getCookiesPromised
): Promise<Cookie[]> {
  const cookies = await getCookies(options.url, "puppeteer", options.profile);
  return cookies.map(normalizeChromeCookie);
}
