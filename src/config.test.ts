import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_ENGINE,
  configFilePath,
  readConfig,
  resolveEngine,
  writeConfig,
} from "./config.js";

test("configFilePath uses XDG_CONFIG_HOME when present", () => {
  assert.equal(
    configFilePath({
      env: {
        XDG_CONFIG_HOME: "/tmp/xdg-config",
      },
      homedir: "/Users/example",
    }),
    "/tmp/xdg-config/hedlis/config.toml",
  );
});

test("configFilePath falls back to ~/.config/hedlis/config.toml", () => {
  assert.equal(
    configFilePath({
      env: {},
      homedir: "/Users/example",
    }),
    "/Users/example/.config/hedlis/config.toml",
  );
});

test("readConfig returns an empty object when the config file is absent", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-config-"));

  assert.deepEqual(
    readConfig(path.join(tempRoot, "config.toml")),
    {},
  );
});

test("writeConfig persists the engine as TOML and readConfig loads it back", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-config-"));
  const configPath = path.join(tempRoot, "config.toml");

  writeConfig(configPath, { engine: "patchright" });

  assert.equal(
    fs.readFileSync(configPath, "utf8"),
    'engine = "patchright"\n',
  );
  assert.deepEqual(readConfig(configPath), {
    engine: "patchright",
  });
});

test("resolveEngine prefers the cli engine over the config engine", () => {
  assert.equal(
    resolveEngine({
      cliEngine: "playwright",
      config: { engine: "patchright" },
    }),
    "playwright",
  );
});

test("resolveEngine falls back to the configured engine and then the default", () => {
  assert.equal(
    resolveEngine({
      config: { engine: "patchright" },
    }),
    "patchright",
  );
  assert.equal(
    resolveEngine({
      config: {},
    }),
    DEFAULT_ENGINE,
  );
});

test("readConfig rejects unsupported engine values", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-config-"));
  const configPath = path.join(tempRoot, "config.toml");
  fs.writeFileSync(configPath, 'engine = "selenium"\n');

  assert.throws(
    () => readConfig(configPath),
    /unsupported engine/i,
  );
});
