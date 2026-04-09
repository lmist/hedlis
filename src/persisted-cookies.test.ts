import test from "node:test";
import assert from "node:assert/strict";
import type { Cookie } from "./cookies.js";
import {
  persistedCookieFileName,
  persistedCookiePath,
  serializeCookies,
} from "./persisted-cookies.js";

test("persistedCookieFileName uses a lowercase hostname", () => {
  assert.equal(persistedCookieFileName("https://X.com/path"), "x.com.json");
});

test("persistedCookiePath joins the cookies directory and derived file name", () => {
  assert.equal(
    persistedCookiePath("https://x.com/path", "/tmp/cloak-cookies"),
    "/tmp/cloak-cookies/x.com.json"
  );
});

test("serializeCookies writes pretty JSON with a trailing newline", () => {
  const cookies: Cookie[] = [
    {
      name: "session",
      value: "abc",
      domain: ".example.com",
      path: "/",
    },
  ];

  assert.equal(
    serializeCookies(cookies),
    `${JSON.stringify(cookies, null, 2)}\n`
  );
});
