import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importCookiesCommand } from "./import-cookies.js";
import type { Cookie } from "./cookies.js";
import { CHROME_COOKIE_LIMITATION_WARNING } from "./chrome-cookies.js";

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vilnius-import-"));
}

function sampleCookies(): Cookie[] {
  return [
    {
      name: "sessionid",
      value: "abc123",
      domain: ".x.com",
      path: "/",
      httpOnly: true,
      secure: true,
    },
  ];
}

test("importCookiesCommand writes into the configured cookies directory by default", async () => {
  const tempRoot = createTempRoot();
  const cookiesDir = path.join(tempRoot, "cookies");

  await importCookiesCommand(
    {
      url: "https://x.com",
      cookiesDir,
    },
    {
      readChromeCookies: async () => sampleCookies(),
    }
  );

  const outputPath = path.join(cookiesDir, "x.com.json");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(outputPath, "utf8")),
    sampleCookies()
  );
});

test("importCookiesCommand resolves an explicit relative output path from the working directory", async () => {
  const tempRoot = createTempRoot();
  const cookiesDir = path.join(tempRoot, "cookies");
  const outputPath = path.join(tempRoot, "exports", "custom.json");

  await importCookiesCommand(
    {
      url: "https://x.com",
      profile: "Profile 2",
      output: "exports/custom.json",
      cwd: tempRoot,
      cookiesDir,
    },
    {
      readChromeCookies: async ({
        profile,
      }: {
        url: string;
        profile?: string;
      }) => {
        assert.equal(profile, "Profile 2");
        return sampleCookies();
      },
    }
  );

  assert.deepEqual(
    JSON.parse(fs.readFileSync(outputPath, "utf8")),
    sampleCookies()
  );
});

test("importCookiesCommand overwrites an existing default target file", async () => {
  const tempRoot = createTempRoot();
  const cookiesDir = path.join(tempRoot, "cookies");
  const outputPath = path.join(cookiesDir, "x.com.json");
  fs.mkdirSync(cookiesDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify([{ stale: true }]));

  await importCookiesCommand(
    {
      url: "https://x.com",
      cookiesDir,
    },
    {
      readChromeCookies: async () => sampleCookies(),
    }
  );

  assert.deepEqual(
    JSON.parse(fs.readFileSync(outputPath, "utf8")),
    sampleCookies()
  );
});

test("importCookiesCommand warns about the Chrome duplicate-cookie limitation", async () => {
  const tempRoot = createTempRoot();
  const warnings: string[] = [];

  await importCookiesCommand(
    {
      url: "https://x.com",
      cookiesDir: path.join(tempRoot, "cookies"),
    },
    {
      readChromeCookies: async () => sampleCookies(),
      warn: (message: string) => warnings.push(message),
    }
  );

  assert.deepEqual(warnings, [CHROME_COOKIE_LIMITATION_WARNING]);
});

test("importCookiesCommand fails fast when Chrome returns no cookies", async () => {
  const tempRoot = createTempRoot();

  await assert.rejects(
    importCookiesCommand(
      {
        url: "https://x.com",
        cookiesDir: path.join(tempRoot, "cookies"),
      },
      {
        readChromeCookies: async () => [],
      }
    ),
    /No cookies found/
  );
});
