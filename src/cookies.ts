import fs from "node:fs";
import path from "node:path";

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

interface BrowserExportCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
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

export function normalizeCookie(raw: Cookie | BrowserExportCookie): Cookie {
  const cookie: Cookie = {
    name: raw.name,
    value: raw.value,
    domain: raw.domain,
    path: raw.path,
  };

  if (typeof raw.httpOnly === "boolean") {
    cookie.httpOnly = raw.httpOnly;
  }

  if (typeof raw.secure === "boolean") {
    cookie.secure = raw.secure;
  }

  if ("expires" in raw && typeof raw.expires === "number") {
    cookie.expires = Math.trunc(raw.expires);
  } else if (
    "expirationDate" in raw &&
    typeof raw.expirationDate === "number"
  ) {
    cookie.expires = Math.trunc(raw.expirationDate);
  }

  const sameSite = normalizeSameSite(raw.sameSite);
  if (sameSite) {
    cookie.sameSite = sameSite;
  }

  return cookie;
}

function cookieIdentity(cookie: Cookie): string {
  return `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}`;
}

export function mergeCookies(
  diskCookies: Cookie[],
  browserCookies: Cookie[]
): Cookie[] {
  const merged = new Map<string, Cookie>();

  for (const cookie of diskCookies) {
    merged.set(cookieIdentity(cookie), cookie);
  }

  for (const cookie of browserCookies) {
    merged.set(cookieIdentity(cookie), cookie);
  }

  return [...merged.values()];
}

export async function loadCookies(cookiesDir: string): Promise<Cookie[]> {
  if (!fs.existsSync(cookiesDir)) {
    console.log("No cookies/ directory found");
    return [];
  }

  const files = fs
    .readdirSync(cookiesDir)
    .filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No .json files in cookies/");
    return [];
  }

  const all: Cookie[] = [];

  for (const file of files) {
    const filePath = path.join(cookiesDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Array<Cookie | BrowserExportCookie>;
    const cookies = parsed.map(normalizeCookie);
    all.push(...cookies);
    console.log(`Loaded ${cookies.length} cookies from ${file}`);
  }

  return all;
}
