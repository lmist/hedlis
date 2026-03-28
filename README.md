# hedlis

`hedlis` launches a persistent browser with your extension and cookies already loaded.

It supports two engines:
- `playwright` for the default Playwright + Chromium path
- `patchright` for the Patchright path

## Install

`hedlis` is not published on npm yet. Install it globally from GitHub:

```bash
npm install -g github:lmist/hedlis
```

Install the browser runtime you want to use:

```bash
# Default engine
npx playwright install chromium

# Patchright engine
npx patchright install chromium
```

## Quick Start

`hedlis` reads `extensions/` and `cookies/` from your current working directory, not from the global install location.

Create a folder for a session:

```text
my-session/
  extensions/
    opencli-extension.zip
  cookies/
    x.com.json
```

Then run:

```bash
cd my-session
hedlis
```

Stop it with `Ctrl+C` or by closing the browser window.

## Your First Run

If you just want the default setup:

```bash
hedlis --headless
```

If you want Patchright for a single run:

```bash
hedlis --engine patchright
```

If you want Patchright to be the default:

```bash
hedlis config path
hedlis config get engine
hedlis config set engine patchright
```

Switch back any time:

```bash
hedlis config set engine playwright
```

Config precedence is:
- CLI flags
- config file
- built-in default (`playwright`)

The config file path is usually:

```text
~/.config/hedlis/config.toml
```

## Engines

### Playwright

This is the default. `hedlis` launches Playwright's Chromium path and loads your extension automatically.

### Patchright

`hedlis` uses Patchright's bundled **Google Chrome for Testing** executable, not your regular signed-in Google Chrome profile. That is the path currently used to keep the Patchright engine and still load the local extension automatically.

Use it per run:

```bash
hedlis --engine patchright
```

## Extensions

Put one or more `.zip` files in `extensions/`.

Each zip must contain a Chrome extension with `manifest.json`:
- at the zip root, or
- one directory below the zip root

Example:

```text
extensions/
  opencli-extension.zip
```

`hedlis` unpacks those zips and loads them automatically on launch.

## Cookies

There are two ways to provide cookies.

### 1. Cookie files

Put JSON cookie files in `cookies/`.

Example:

```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax",
    "expires": 1742860800
  }
]
```

`hedlis` merges every cookie file in `cookies/` and injects the result at startup.

### 2. Import from Chrome

Import cookies into `cookies/`:

```bash
hedlis import-cookies --browser chrome --url https://x.com
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 2"
```

Or load them only for the current launch:

```bash
hedlis --cookies-from-browser chrome --cookie-url https://x.com
hedlis --cookies-from-browser chrome --cookie-url https://x.com --chrome-profile "Profile 2"
```

Notes:
- browser-cookie access is always explicit
- only Chrome is supported for browser-cookie import
- a closed Chrome instance usually gives the freshest on-disk cookie state

Known limitation:
`chrome-cookies-secure` may collapse same-name cookies across different paths or subdomains before `hedlis` sees them. If imported cookies look incomplete or login still fails, that may be the cause.

## Common Commands

```bash
hedlis --help
hedlis --headless
hedlis --engine patchright
hedlis config get engine
hedlis config set engine patchright
hedlis import-cookies --browser chrome --url https://x.com
hedlis --cookies-from-browser chrome --cookie-url https://x.com
```

## Developer Setup

If you are working on the repo itself:

```bash
npm install
npm run build
npm test
npm start -- --headless
```

If you want the local checkout on your shell path:

```bash
npm link
hedlis --help
```

GitHub Actions runs CI on pull requests and pushes to `main`:

```bash
npm ci
npm test
npm run build
```
