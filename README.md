---
title: hedlis
description: Headless Patchright launcher and Chrome-cookie bootstrapper for OpenCLI.
engine_url: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/
companion_url: https://github.com/jackwener/opencli
extension_url: https://github.com/jackwener/opencli/releases/download/v1.5.5/opencli-extension.zip
---

# hedlis

## OpenCLI's Quiet Browser

`hedlis` is a companion CLI for [OpenCLI](https://github.com/jackwener/opencli), powered by [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/), and it always loads the pinned [OpenCLI extension archive](https://github.com/jackwener/opencli/releases/download/v1.5.5/opencli-extension.zip).

The job is simple:

- keep the automation browser headless unless you explicitly ask for a window
- let you copy cookies out of your own Chrome profile
- give OpenCLI a clean browser context that is not your day-to-day visible browser

If you do not want a live automation browser hanging around on screen, especially one that is not the browser you are actively using, this is the tool.

Type `hedlis` with no arguments and it prints help. Launching is explicit:

```bash
hedlis run
hedlis run -w
```

`hedlis run` is headless by default. `hedlis run -w` or `hedlis run --window` opens the real browser window.

## Install

```bash
bun install
bunx patchright install chromium
bun run build
```

For local development you can also run:

```bash
bun test
bun run typecheck
```

## 1. List Chrome Profiles

Start here:

```bash
hedlis list-profiles
```

Typical output looks like this:

```text
Default: Personal
Profile 1: Work
Profile 3: Throwaway
```

Pick the profile that already has the site login you want.

## 2. Pull Cookies From That Profile

Instagram:

```bash
hedlis import-cookies --browser chrome --url https://instagram.com --chrome-profile "Profile 1"
```

X:

```bash
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 1"
```

YouTube:

```bash
hedlis import-cookies --browser chrome --url https://youtube.com --chrome-profile "Profile 1"
```

By default, those commands write:

- `~/.config/hedlis/cookies/instagram.com.json`
- `~/.config/hedlis/cookies/x.com.json`
- `~/.config/hedlis/cookies/youtube.com.json`

If you want a custom file path instead:

```bash
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 1" --output ./exports/x.json
```

## 3. Run The Browser

Headless:

```bash
hedlis run
```

Headless with one-off browser cookies pulled straight from Chrome:

```bash
hedlis run --cookies-from-browser chrome --cookie-url https://x.com --chrome-profile "Profile 1"
```

Visible window:

```bash
hedlis run -w
```

## Where It Stores Stuff

No matter whether you invoke it as a locally installed `hedlis`, through `bunx`, or through a package-manager install later, persistent state lives in:

- `~/.config/hedlis/cookies/`
- `~/.config/hedlis/extensions/`

Specifically:

- imported cookies go into `~/.config/hedlis/cookies/`
- the pinned OpenCLI extension archive lives at `~/.config/hedlis/extensions/opencli-extension.zip`
- the extracted extension directory and the Patchright user profile are created in the OS temp directory for each run

## How The Extension Gets There

`hedlis` uses a package postinstall step plus a runtime repair check.

At install time, `src/install-extension.ts` ensures the pinned OpenCLI extension archive exists at:

```text
~/.config/hedlis/extensions/opencli-extension.zip
```

At runtime, `hedlis run` validates that archive again before Patchright starts. If the file is missing or invalid, it re-downloads it and only then launches the browser with:

- `--disable-extensions-except=<extracted-extension-dir>`
- `--load-extension=<extracted-extension-dir>`

## How Cookies Get There

`hedlis import-cookies` reads Chrome cookies for the exact site URL you pass in, scoped to the Chrome profile you name, normalizes them for Patchright/Playwright-style injection, and writes them into `~/.config/hedlis/cookies/<hostname>.json` by default.

`hedlis run` then loads every `.json` file in `~/.config/hedlis/cookies/` and injects the combined set into the automation browser before startup.

If you use `hedlis run --cookies-from-browser ...`, it skips the disk write and pulls scoped Chrome cookies for that run only.

## One Sharp Edge

Chrome cookie extraction depends on `chrome-cookies-secure`, and that tool can collapse same-name cookies across different paths or subdomains before `hedlis` sees them. If a login still fails after import, that is the first thing to suspect.
