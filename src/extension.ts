import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { defaultAppRootDir, resolveAppPaths } from "./app-paths.js";

export const REQUIRED_EXTENSION_URL =
  "https://github.com/jackwener/opencli/releases/download/v1.5.5/opencli-extension.zip";
export const REQUIRED_EXTENSION_ARCHIVE_NAME = "opencli-extension.zip";

type DownloadRequiredExtensionDependencies = {
  fetchImpl?: typeof fetch;
  validateExtensionArchive?: (archivePath: string) => void;
  log?: (message: string) => void;
};

type EnsureRequiredExtensionDependencies = {
  validateExtensionArchive?: (archivePath: string) => void;
  downloadRequiredExtension?: (
    extensionsDir: string,
    dependencies?: DownloadRequiredExtensionDependencies
  ) => Promise<string>;
  log?: (message: string) => void;
};

type PrepareRequiredExtensionDependencies = {
  ensureRequiredExtensionArchive?: (
    extensionsDir: string,
    dependencies?: EnsureRequiredExtensionDependencies
  ) => Promise<string>;
  makeTempDir?: (prefix: string) => string;
};

export function validateExtensionArchive(archivePath: string): void {
  let zip: AdmZip;

  try {
    zip = new AdmZip(archivePath);
  } catch (error) {
    throw new Error(`Invalid required extension archive at ${archivePath}`, {
      cause: error,
    });
  }

  const entryNames = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => normalizeZipEntryName(entry.entryName));

  if (entryNames.length === 0) {
    throw new Error(`Required extension archive is empty: ${archivePath}`);
  }

  if (!findManifestEntry(entryNames)) {
    throw new Error(
      `Required extension archive must contain manifest.json at the root or one directory deep: ${archivePath}`
    );
  }
}

export async function downloadRequiredExtensionArchive(
  extensionsDir: string,
  dependencies: DownloadRequiredExtensionDependencies = {}
): Promise<string> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const validateArchive = dependencies.validateExtensionArchive ?? validateExtensionArchive;
  const log = dependencies.log ?? console.log;
  const archivePath = path.join(extensionsDir, REQUIRED_EXTENSION_ARCHIVE_NAME);
  const tempArchivePath = path.join(
    extensionsDir,
    `${REQUIRED_EXTENSION_ARCHIVE_NAME}.download-${process.pid}-${Date.now()}`
  );

  fs.mkdirSync(extensionsDir, { recursive: true });

  const response = await fetchImpl(REQUIRED_EXTENSION_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download required extension: ${response.status} ${response.statusText}`
    );
  }

  const archiveBody = Buffer.from(await response.arrayBuffer());

  fs.writeFileSync(tempArchivePath, archiveBody);

  try {
    validateArchive(tempArchivePath);
    fs.rmSync(archivePath, { force: true });
    fs.renameSync(tempArchivePath, archivePath);
  } catch (error) {
    fs.rmSync(tempArchivePath, { force: true });
    throw error;
  }

  log(`Prepared required extension archive at ${archivePath}`);

  return archivePath;
}

export async function ensureRequiredExtensionArchive(
  extensionsDir: string,
  dependencies: EnsureRequiredExtensionDependencies = {}
): Promise<string> {
  const validateArchive = dependencies.validateExtensionArchive ?? validateExtensionArchive;
  const downloadRequiredExtension =
    dependencies.downloadRequiredExtension ?? downloadRequiredExtensionArchive;
  const log = dependencies.log ?? console.log;
  const archivePath = path.join(extensionsDir, REQUIRED_EXTENSION_ARCHIVE_NAME);

  if (fs.existsSync(archivePath)) {
    try {
      validateArchive(archivePath);
      return archivePath;
    } catch {
      log(`Repairing required extension archive at ${archivePath}`);
    }
  } else {
    log(`Downloading required extension archive to ${archivePath}`);
  }

  const refreshedArchivePath = await downloadRequiredExtension(extensionsDir, {
    validateExtensionArchive: validateArchive,
    log,
  });
  validateArchive(refreshedArchivePath);

  return refreshedArchivePath;
}

export async function prepareRequiredExtension(
  extensionsDir: string,
  dependencies: PrepareRequiredExtensionDependencies = {}
): Promise<string> {
  const ensureArchive =
    dependencies.ensureRequiredExtensionArchive ?? ensureRequiredExtensionArchive;
  const makeTempDir = dependencies.makeTempDir ?? fs.mkdtempSync;
  const archivePath = await ensureArchive(extensionsDir);
  const tempDir = makeTempDir(path.join(os.tmpdir(), "hedlis-ext-"));

  new AdmZip(archivePath).extractAllTo(tempDir, true);

  return resolveExtractedExtensionRoot(tempDir);
}

export async function installRequiredExtension(
  rootDir: string = defaultAppRootDir(),
  dependencies: EnsureRequiredExtensionDependencies = {}
): Promise<string> {
  return ensureRequiredExtensionArchive(
    resolveAppPaths(rootDir).extensionsDir,
    dependencies
  );
}

function normalizeZipEntryName(entryName: string): string {
  return entryName.replace(/\\/g, "/").replace(/^\/+/, "");
}

function findManifestEntry(entryNames: string[]): string | undefined {
  return entryNames.find((entryName) => {
    if (entryName === "manifest.json") {
      return true;
    }

    const segments = entryName.split("/");
    return segments.length === 2 && segments[1] === "manifest.json";
  });
}

function resolveExtractedExtensionRoot(extractedDir: string): string {
  if (fs.existsSync(path.join(extractedDir, "manifest.json"))) {
    return extractedDir;
  }

  const nestedExtension = fs
    .readdirSync(extractedDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .find((entry) =>
      fs.existsSync(path.join(extractedDir, entry.name, "manifest.json"))
    );

  if (!nestedExtension) {
    throw new Error(
      `Required extension archive did not extract a manifest.json: ${extractedDir}`
    );
  }

  return path.join(extractedDir, nestedExtension.name);
}
