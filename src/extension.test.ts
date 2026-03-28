import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REQUIRED_EXTENSION_ARCHIVE_NAME,
  REQUIRED_EXTENSION_URL,
  downloadRequiredExtensionArchive,
  ensureRequiredExtensionArchive,
  installRequiredExtension,
  prepareRequiredExtension,
} from "./extension.js";

test("downloadRequiredExtensionArchive fetches the pinned extension asset into extensions/", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-extension-"));
  const extensionsDir = path.join(tempRoot, "extensions");
  const fixture = fs.readFileSync(path.resolve("extensions/opencli-extension.zip"));
  const requests: string[] = [];

  const archivePath = await downloadRequiredExtensionArchive(extensionsDir, {
    fetchImpl: async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(fixture);
    },
  });

  assert.deepEqual(requests, [REQUIRED_EXTENSION_URL]);
  assert.equal(path.basename(archivePath), REQUIRED_EXTENSION_ARCHIVE_NAME);
  assert.deepEqual(fs.readFileSync(archivePath), fixture);
});

test("ensureRequiredExtensionArchive keeps a valid existing archive", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-extension-"));
  const extensionsDir = path.join(tempRoot, "extensions");
  const archivePath = path.join(extensionsDir, REQUIRED_EXTENSION_ARCHIVE_NAME);

  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.writeFileSync(archivePath, "existing archive");

  const result = await ensureRequiredExtensionArchive(extensionsDir, {
    validateExtensionArchive: () => undefined,
    downloadRequiredExtension: async () => {
      throw new Error("should not download a valid archive");
    },
  });

  assert.equal(result, archivePath);
});

test("ensureRequiredExtensionArchive repairs an invalid archive by downloading a fresh copy", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-extension-"));
  const extensionsDir = path.join(tempRoot, "extensions");
  const archivePath = path.join(extensionsDir, REQUIRED_EXTENSION_ARCHIVE_NAME);
  let validateCalls = 0;
  let downloadCalls = 0;

  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.writeFileSync(archivePath, "broken archive");

  const result = await ensureRequiredExtensionArchive(extensionsDir, {
    validateExtensionArchive: () => {
      validateCalls += 1;
      if (validateCalls === 1) {
        throw new Error("invalid archive");
      }
    },
    downloadRequiredExtension: async () => {
      downloadCalls += 1;
      fs.writeFileSync(archivePath, "fresh archive");
      return archivePath;
    },
  });

  assert.equal(result, archivePath);
  assert.equal(validateCalls, 2);
  assert.equal(downloadCalls, 1);
});

test("prepareRequiredExtension extracts the required extension and returns a manifest root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-extension-"));
  const extensionsDir = path.join(tempRoot, "extensions");
  const archivePath = path.join(extensionsDir, REQUIRED_EXTENSION_ARCHIVE_NAME);
  const fixture = path.resolve("extensions/opencli-extension.zip");

  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.copyFileSync(fixture, archivePath);

  const extensionPath = await prepareRequiredExtension(extensionsDir);

  assert.ok(fs.existsSync(path.join(extensionPath, "manifest.json")));
});

test("installRequiredExtension stores the archive in the configured app-home extensions directory", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hedlis-extension-"));
  const expectedArchivePath = path.join(
    tempRoot,
    "extensions",
    REQUIRED_EXTENSION_ARCHIVE_NAME
  );
  const seenExtensionsDirs: string[] = [];

  const archivePath = await installRequiredExtension(tempRoot, {
    validateExtensionArchive: () => undefined,
    downloadRequiredExtension: async (extensionsDir: string) => {
      seenExtensionsDirs.push(extensionsDir);
      fs.mkdirSync(extensionsDir, { recursive: true });
      fs.writeFileSync(expectedArchivePath, "archive");
      return expectedArchivePath;
    },
    log: () => undefined,
  });

  assert.deepEqual(seenExtensionsDirs, [path.join(tempRoot, "extensions")]);
  assert.equal(archivePath, expectedArchivePath);
});
