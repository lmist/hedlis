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

test("readChromeCookies normalizes persistent, expired, and session puppeteer cookies", async () => {
  const cookies = await readChromeCookies(
    { url: "https://x.com" },
    async () => [
      {
        name: "sessionid",
        value: "abc123",
        domain: ".x.com",
        path: "/",
        expires: 11644473602500000,
        HttpOnly: true,
        Secure: true,
      },
      {
        name: "expired",
        value: "ghi789",
        domain: ".x.com",
        path: "/",
        expires: 11644473599000000,
      },
      {
        name: "csrftoken",
        value: "def456",
        domain: ".x.com",
        path: "/",
        expires: 0,
        HttpOnly: true,
      },
    ]
  );

  assert.deepEqual(cookies, [
    {
      name: "sessionid",
      value: "abc123",
      domain: ".x.com",
      path: "/",
      expires: 2,
      httpOnly: true,
      secure: true,
    },
    {
      name: "expired",
      value: "ghi789",
      domain: ".x.com",
      path: "/",
      expires: -1,
    },
    {
      name: "csrftoken",
      value: "def456",
      domain: ".x.com",
      path: "/",
      httpOnly: true,
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
