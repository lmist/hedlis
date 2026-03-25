import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  defaultCookieOutputPath,
  readChromeCookies,
} from "./chrome-cookies.js";

test("readChromeCookies passes the requested URL to the injected reader", async () => {
  const calls: Array<[string, string, string | undefined]> = [];
  const getCookies = async (url: string, format: string, profile?: string) => {
    calls.push([url, format, profile]);
    return [];
  };

  await readChromeCookies({ url: "https://x.com" }, getCookies);

  assert.deepEqual(calls, [["https://x.com", "puppeteer", undefined]]);
});

test("readChromeCookies passes the Chrome profile through to the injected reader", async () => {
  const calls: Array<[string, string, string | undefined]> = [];
  const getCookies = async (url: string, format: string, profile?: string) => {
    calls.push([url, format, profile]);
    return [];
  };

  await readChromeCookies(
    { url: "https://x.com", profile: "Profile 2" },
    getCookies
  );

  assert.deepEqual(calls, [["https://x.com", "puppeteer", "Profile 2"]]);
});

test("readChromeCookies normalizes puppeteer cookies into the internal Cookie shape", async () => {
  const cookies = await readChromeCookies(
    { url: "https://x.com" },
    async () => [
      {
        name: "sessionid",
        value: "abc123",
        domain: ".x.com",
        path: "/",
        expires: 1798830478,
        HttpOnly: true,
        Secure: true,
      },
    ]
  );

  assert.deepEqual(cookies, [
    {
      name: "sessionid",
      value: "abc123",
      domain: ".x.com",
      path: "/",
      expires: 1798830478,
      httpOnly: true,
      secure: true,
    },
  ]);
});

test("defaultCookieOutputPath strips the port and lowercases the hostname", () => {
  const outputPath = defaultCookieOutputPath(
    "https://X.com:443/path",
    "/tmp/cookies"
  );

  assert.equal(outputPath, path.join("/tmp/cookies", "x.com.json"));
});
