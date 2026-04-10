import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { CloakStateDb } from "./state-db.js"

function createStateDb() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloak-state-db-"))
  const dbPath = path.join(root, "state.sqlite")

  return {
    root,
    db: new CloakStateDb(dbPath),
  }
}

test("CloakStateDb stores the default profile", () => {
  const { db } = createStateDb()

  assert.equal(db.getDefaultProfile(), undefined)
  db.setDefaultProfile("Profile 7")
  assert.equal(db.getDefaultProfile(), "Profile 7")
})

test("CloakStateDb remembers and replaces cookie URLs per profile", () => {
  const { db } = createStateDb()

  assert.deepEqual(
    db.rememberCookieUrls("Profile 7", ["https://x.com", "https://github.com"]),
    ["https://github.com", "https://x.com"]
  )
  assert.deepEqual(db.getRememberedCookieUrls("Profile 7"), [
    "https://github.com",
    "https://x.com",
  ])
  assert.deepEqual(
    db.replaceRememberedCookieUrls("Profile 7", ["https://linear.app"]),
    ["https://linear.app"]
  )
  assert.deepEqual(db.getRememberedCookieUrls("Profile 7"), [
    "https://linear.app",
  ])
})

test("CloakStateDb stores daemon state and the last daemon command", () => {
  const { db } = createStateDb()

  db.setLastDaemonCommand({
    headless: true,
    profile: "Profile 7",
    cookieUrls: ["https://x.com"],
  })
  db.setDaemonState({
    pid: 4242,
    headless: true,
    profile: "Profile 7",
    cookieUrls: ["https://x.com"],
    startedAt: "2026-04-10T10:00:00.000Z",
    logPath: "/tmp/cloak.log",
  })

  assert.deepEqual(db.getLastDaemonCommand(), {
    headless: true,
    profile: "Profile 7",
    cookieUrls: ["https://x.com"],
  })
  assert.deepEqual(db.getDaemonState(), {
    pid: 4242,
    headless: true,
    profile: "Profile 7",
    cookieUrls: ["https://x.com"],
    startedAt: "2026-04-10T10:00:00.000Z",
    logPath: "/tmp/cloak.log",
  })

  db.clearDaemonState(1111)
  assert.equal(db.getDaemonState()?.pid, 4242)
  db.clearDaemonState(4242)
  assert.equal(db.getDaemonState(), undefined)
})
