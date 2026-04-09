#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const tag = process.argv[2];

if (!tag) {
  console.error("Usage: node scripts/check-release-tag.cjs <tag>");
  process.exit(1);
}

if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Release tag must look like v<semver>: received ${tag}`);
  process.exit(1);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8")
);
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  console.error(
    `Release tag ${tag} does not match package.json version ${packageJson.version}`
  );
  process.exit(1);
}
