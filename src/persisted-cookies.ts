import path from "node:path";
import type { Cookie } from "./cookies.js";

export function persistedCookieFileName(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  const safeHost = hostname.replace(/[^a-z0-9.-]+/g, "_");
  return `${safeHost}.json`;
}

export function persistedCookiePath(url: string, cookiesDir: string): string {
  return path.join(cookiesDir, persistedCookieFileName(url));
}

export function serializeCookies(cookies: Cookie[]): string {
  return `${JSON.stringify(cookies, null, 2)}\n`;
}
