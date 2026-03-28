import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { defaultAppRootDir, resolveAppPaths } from "./app-paths.js";

test("defaultAppRootDir resolves to ~/.config/hedlis", () => {
  assert.equal(
    defaultAppRootDir({
      homedir: () => "/Users/tester",
    }),
    path.join("/Users/tester", ".config", "hedlis")
  );
});

test("resolveAppPaths derives cookies and extensions directories from the app root", () => {
  assert.deepEqual(resolveAppPaths("/tmp/hedlis"), {
    rootDir: "/tmp/hedlis",
    cookiesDir: path.join("/tmp/hedlis", "cookies"),
    extensionsDir: path.join("/tmp/hedlis", "extensions"),
  });
});
