import test from "node:test"
import assert from "node:assert/strict"
import {
  buildRunArguments,
  isProcessRunning,
  stopProcess,
} from "./daemon.js"

test("buildRunArguments serializes the saved daemon command", () => {
  assert.deepEqual(
    buildRunArguments({
      headless: false,
      profile: "Profile 7",
      cookieUrls: ["https://x.com", "https://github.com"],
    }),
    [
      "run",
      "--window",
      "--profile",
      "Profile 7",
      "--cookie-url",
      "https://x.com",
      "--cookie-url",
      "https://github.com",
    ]
  )
})

test("isProcessRunning treats ESRCH as a stopped process", () => {
  assert.equal(
    isProcessRunning(42, () => {
      throw Object.assign(new Error("missing"), { code: "ESRCH" })
    }),
    false
  )
})

test("stopProcess sends SIGTERM and waits for the process to disappear", async () => {
  const signals: Array<NodeJS.Signals | number | undefined> = []
  let checks = 0

  const stopped = await stopProcess(42, {
    killProcess: (_pid, signal) => {
      signals.push(signal)
    },
    isProcessRunning: () => {
      checks += 1
      return checks < 3
    },
    sleep: async () => undefined,
    timeoutMs: 100,
    intervalMs: 1,
  })

  assert.equal(stopped, true)
  assert.deepEqual(signals, ["SIGTERM"])
})
