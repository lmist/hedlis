import test from "node:test";
import assert from "node:assert/strict";
import { listChromeProfiles } from "./chrome-profiles.js";

test("listChromeProfiles returns profiles with valid Preferences files", () => {
  const files: Record<string, string> = {
    "/chrome/Default/Preferences": JSON.stringify({ profile: { name: "Person 1" } }),
    "/chrome/Profile 1/Preferences": JSON.stringify({
      profile: { name: "Work" },
      account_info: [{ full_name: "Alice Smith" }],
    }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "Profile 1", "CrashpadMetrics", "Local State"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Default", name: "Person 1" },
    { directory: "Profile 1", name: "Work", accountName: "Alice Smith" },
  ]);
});

test("listChromeProfiles skips directories without Preferences", () => {
  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "Profile 1"],
    readFile: () => {
      throw new Error("ENOENT");
    },
  });

  assert.deepEqual(result, []);
});

test("listChromeProfiles returns empty when Chrome data dir does not exist", () => {
  const result = listChromeProfiles({
    chromeUserDataDir: "/nonexistent",
    readdir: () => {
      throw new Error("ENOENT");
    },
    readFile: () => {
      throw new Error("ENOENT");
    },
  });

  assert.deepEqual(result, []);
});

test("listChromeProfiles ignores non-profile directories", () => {
  const files: Record<string, string> = {
    "/chrome/Default/Preferences": JSON.stringify({ profile: { name: "Main" } }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "GrShaderCache", "ShaderCache", "extensions_crx_cache"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Default", name: "Main" },
  ]);
});

test("listChromeProfiles sorts profiles by directory name", () => {
  const files: Record<string, string> = {
    "/chrome/Profile 2/Preferences": JSON.stringify({ profile: { name: "Gaming" } }),
    "/chrome/Default/Preferences": JSON.stringify({ profile: { name: "Main" } }),
    "/chrome/Profile 1/Preferences": JSON.stringify({ profile: { name: "Work" } }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Profile 2", "Default", "Profile 1"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Default", name: "Main" },
    { directory: "Profile 1", name: "Work" },
    { directory: "Profile 2", name: "Gaming" },
  ]);
});

test("listChromeProfiles handles malformed Preferences JSON gracefully", () => {
  const files: Record<string, string> = {
    "/chrome/Default/Preferences": "not json",
    "/chrome/Profile 1/Preferences": JSON.stringify({ profile: { name: "Work" } }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "Profile 1"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Profile 1", name: "Work" },
  ]);
});

test("listChromeProfiles includes accountName from account_info when present", () => {
  const files: Record<string, string> = {
    "/chrome/Default/Preferences": JSON.stringify({
      profile: { name: "Person 1" },
      account_info: [{ full_name: "Louai Misto" }],
    }),
    "/chrome/Profile 1/Preferences": JSON.stringify({
      profile: { name: "Your Chrome" },
      account_info: [{}],
    }),
    "/chrome/Profile 2/Preferences": JSON.stringify({
      profile: { name: "Guest" },
    }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "Profile 1", "Profile 2"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Default", name: "Person 1", accountName: "Louai Misto" },
    { directory: "Profile 1", name: "Your Chrome" },
    { directory: "Profile 2", name: "Guest" },
  ]);
});

test("listChromeProfiles handles Preferences missing profile.name", () => {
  const files: Record<string, string> = {
    "/chrome/Default/Preferences": JSON.stringify({ extensions: {} }),
    "/chrome/Profile 1/Preferences": JSON.stringify({ profile: { name: "Work" } }),
  };

  const result = listChromeProfiles({
    chromeUserDataDir: "/chrome",
    readdir: () => ["Default", "Profile 1"],
    readFile: (p: string) => {
      if (files[p] !== undefined) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
  });

  assert.deepEqual(result, [
    { directory: "Profile 1", name: "Work" },
  ]);
});
