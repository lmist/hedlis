# Cookie JSON Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept browser-export JSON cookie files in `cookies/` by normalizing them to Playwright cookie objects at load time.

**Architecture:** Keep file discovery unchanged and normalize each parsed cookie entry in `src/cookies.ts` before aggregation. Add focused tests that exercise both Playwright-format JSON and browser-export JSON using temporary files.

**Tech Stack:** TypeScript, Node test runner, Playwright cookie shape

---

### Task 1: Add loader tests

**Files:**
- Create: `src/cookies.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Add one test that writes a browser-export JSON file with `expirationDate` and lower-case/exporter `sameSite` values, then asserts `loadCookies()` returns Playwright-shaped cookies. Add one test that writes an existing Playwright-format JSON file and asserts it still loads unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because browser-export JSON is not normalized.

- [ ] **Step 3: Write minimal implementation**

Normalize browser-export cookie objects inside `src/cookies.ts` while preserving existing Playwright JSON behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

### Task 2: Verify with real startup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document supported JSON exports**

Update cookie docs to say browser-export JSON is accepted and normalized automatically.

- [ ] **Step 2: Run app with real cookie file**

Run: `npm start -- --headless`
Expected: cookies load without Playwright shape errors.
