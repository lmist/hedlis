import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCookies } from "./cookies.js";

test("loadCookies preserves Playwright-format cookies", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vilnius-cookies-"));
  const filePath = path.join(dir, "example.com.json");

  const source = [
    {
      name: "sessionid",
      value: "abc",
      domain: ".example.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
      expires: 1798830478,
    },
  ];

  fs.writeFileSync(filePath, JSON.stringify(source));

  const cookies = await loadCookies(dir);

  assert.deepEqual(cookies, source);
});

test("loadCookies normalizes browser-export JSON cookies", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vilnius-cookies-"));
  const filePath = path.join(dir, "instagram.json");

  fs.writeFileSync(
    filePath,
    JSON.stringify([
      {
        domain: ".instagram.com",
        expirationDate: 1798830478.408272,
        hostOnly: false,
        httpOnly: true,
        name: "mid",
        path: "/",
        sameSite: "no_restriction",
        secure: true,
        session: false,
        storeId: "0",
        value: "cookie-value",
      },
      {
        domain: ".instagram.com",
        httpOnly: true,
        name: "csrftoken",
        path: "/",
        sameSite: "unspecified",
        secure: true,
        session: true,
        value: "csrf-value",
      },
    ])
  );

  const cookies = await loadCookies(dir);

  assert.deepEqual(cookies, [
    {
      domain: ".instagram.com",
      expires: 1798830478,
      httpOnly: true,
      name: "mid",
      path: "/",
      sameSite: "None",
      secure: true,
      value: "cookie-value",
    },
    {
      domain: ".instagram.com",
      httpOnly: true,
      name: "csrftoken",
      path: "/",
      secure: true,
      value: "csrf-value",
    },
  ]);
});
