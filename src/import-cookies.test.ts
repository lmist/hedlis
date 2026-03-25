import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importCookiesCommand } from "./import-cookies.js";
import type { Cookie } from "./cookies.js";

function createTempOutputRoot(): string {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vilnius-import-"));
  fs.mkdirSync(path.join(outputRoot, "cookies"), { recursive: true });
  return outputRoot;
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

test("importCookiesCommand writes cookies/x.com.json by default", async () => {
  const outputRoot = createTempOutputRoot();

  await importCookiesCommand(
    {
      url: "https://x.com",
      outputRoot,
    },
    {
      readChromeCookies: async () => sampleCookies(),
    }
  );

  const outputPath = path.join(outputRoot, "cookies", "x.com.json");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(outputPath, "utf8")),
    sampleCookies()
  );
});

test("importCookiesCommand honors an explicit output path", async () => {
  const outputRoot = createTempOutputRoot();
  const outputPath = path.join(outputRoot, "exports", "custom.json");

  await importCookiesCommand(
    {
      url: "https://x.com",
      profile: "Profile 2",
      output: outputPath,
      outputRoot,
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
  const outputRoot = createTempOutputRoot();
  const outputPath = path.join(outputRoot, "cookies", "x.com.json");
  fs.writeFileSync(outputPath, JSON.stringify([{ stale: true }]));

  await importCookiesCommand(
    {
      url: "https://x.com",
      outputRoot,
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

test("importCookiesCommand fails fast when Chrome returns no cookies", async () => {
  const outputRoot = createTempOutputRoot();

  await assert.rejects(
    importCookiesCommand(
      {
        url: "https://x.com",
        outputRoot,
      },
      {
        readChromeCookies: async () => [],
      }
    ),
    /No cookies found/
  );
});
