import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { isHeadlessEnabled, parseCli } from "./cli.js"

function runInlineScript(script: string) {
  return spawnSync("node", ["--import", "tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
}

test("parseCli shows help mode with no arguments", () => {
  const cli = parseCli(["node", "dist/main.js"])

  assert.equal(cli.mode, "help")
  assert.match(cli.text, /Usage:\s+cloak <command>/i)
  assert.match(cli.text, /cloak stop/i)
  assert.match(cli.text, /cloak inspect/i)
  assert.match(cli.text, /cloak state display/i)
})

test("parseCli parses run mode with headless enabled by default", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "run"]), {
    mode: "run",
    headless: true,
    daemon: false,
    persistCookies: false,
    consent: false,
    profile: undefined,
    cookieUrls: [],
  })
})

test("parseCli parses run mode with daemon, consent, profile, and cookie URLs", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "run",
      "--daemon",
      "--consent",
      "--persist-cookies",
      "--profile",
      "Profile 7",
      "--cookie-url",
      "https://x.com",
      "--cookie-url",
      "https://github.com",
    ]),
    {
      mode: "run",
      headless: true,
      daemon: true,
      persistCookies: true,
      consent: true,
      profile: "Profile 7",
      cookieUrls: ["https://x.com/", "https://github.com/"],
    }
  )
})

test("parseCli parses profiles commands", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "profiles", "list"]), {
    mode: "list-profiles",
  })
  assert.deepEqual(parseCli(["node", "dist/main.js", "profiles", "status"]), {
    mode: "profiles-status",
  })
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "profiles",
      "set",
      "default",
      "Profile 7",
      "--consent",
    ]),
    {
      mode: "profiles-set-default",
      profile: "Profile 7",
      consent: true,
    }
  )
})

test("parseCli parses cookies list mode", () => {
  assert.deepEqual(
    parseCli([
      "node",
      "dist/main.js",
      "cookies",
      "list",
      "--no-pager",
      "--limit",
      "20",
    ]),
    {
      mode: "cookies-list",
      limit: 20,
      noPager: true,
      consent: false,
    }
  )
})

test("parseCli parses stop restart and inspect", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "stop"]), {
    mode: "stop",
  })
  assert.deepEqual(parseCli(["node", "dist/main.js", "restart"]), {
    mode: "restart",
  })
  assert.deepEqual(parseCli(["node", "dist/main.js", "inspect"]), {
    mode: "inspect",
  })
})

test("parseCli parses state display and destroy", () => {
  assert.deepEqual(parseCli(["node", "dist/main.js", "state", "display"]), {
    mode: "state-display",
  })
  assert.deepEqual(parseCli(["node", "dist/main.js", "state", "destroy"]), {
    mode: "state-destroy",
  })
})

test("parseCli rejects --persist-cookies without --cookie-url", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--persist-cookies",
      ]),
    /--persist-cookies requires at least one --cookie-url/i
  )
})

test("parseCli rejects non-http cookie URLs", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookie-url",
        "file:///tmp/cookies.txt",
      ]),
    /invalid url/i
  )
})

test("parseCli rejects invalid limits", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "cookies",
        "list",
        "--limit",
        "0",
      ]),
    /positive integer/i
  )
})

test("parseCli rejects the removed browser flag", () => {
  assert.throws(
    () =>
      parseCli([
        "node",
        "dist/main.js",
        "run",
        "--cookies-from-browser",
        "chrome",
      ]),
    /unknown|arguments/i
  )
})

test("parseCli does not write yargs errors to stderr", () => {
  const result = runInlineScript(`
    const { parseCli } = require("./src/cli.ts")
    try {
      parseCli(["node", "src/main.ts", "run", "--persist-cookies"])
      process.exit(0)
    } catch {
      process.exit(1)
    }
  `)

  assert.equal(result.status, 1)
  assert.equal(result.stderr, "")
})

test("isHeadlessEnabled returns false for help mode", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js"]), false)
})

test("isHeadlessEnabled returns true for run mode by default", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "run"]), true)
})

test("isHeadlessEnabled returns false when run mode uses --window", () => {
  assert.equal(isHeadlessEnabled(["node", "dist/main.js", "run", "--window"]), false)
})
