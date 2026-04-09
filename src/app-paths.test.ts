import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  defaultAppRootDir,
  defaultConfigRootDir,
  resolveAppPaths,
} from "./app-paths.js";

test("defaultAppRootDir resolves to ~/.cache/cloak", () => {
  assert.equal(
    defaultAppRootDir({
      homedir: () => "/Users/tester",
    }),
    path.join("/Users/tester", ".cache", "cloak")
  );
});

test("resolveAppPaths uses the cache root as the extension cache directory", () => {
  assert.deepEqual(resolveAppPaths("/tmp/cloak", "/tmp/cloak-config"), {
    extensionsDir: "/tmp/cloak",
    cookiesDir: "/tmp/cloak-config/cookies",
  });
});

test("defaultConfigRootDir resolves to ~/.config/cloak", () => {
  assert.equal(
    defaultConfigRootDir({
      homedir: () => "/Users/tester",
    }),
    path.join("/Users/tester", ".config", "cloak")
  );
});
