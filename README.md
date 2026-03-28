# hedlis

`hedlis` launches a persistent browser with your extension and cookies already loaded.

## Setup

Run the setup script to install everything:

```bash
./setup.sh
```

This installs dependencies, builds, installs Chromium for both engines, downloads the [OpenCLI](https://github.com/jackwener/opencli) extension, and puts `hedlis` on your path.

Or install manually:

```bash
npm install -g github:lmist/hedlis
npx playwright install chromium
npx patchright install chromium
```

## Quick Start

1. Find your Chrome profile:

```bash
hedlis list-profiles
```

2. Import cookies for a site:

```bash
hedlis import-cookies --browser chrome --url https://instagram.com --chrome-profile "Profile 7"
```

3. Launch the browser:

```bash
hedlis --engine patchright
```

Stop with `Ctrl+C` or by closing the browser window. Add `--headless` to run without a visible window.

## How It Works

`hedlis` reads from your current working directory:

- `extensions/` — Chrome extension `.zip` files, unpacked and loaded automatically
- `cookies/` — JSON cookie files, merged and injected at startup

## Engines

`hedlis` supports two browser engines:

| Engine | What it launches | Default? |
|---|---|---|
| `playwright` | Playwright's bundled Chromium | Yes |
| `patchright` | Patchright's Google Chrome for Testing | No |

Use per run:

```bash
hedlis --engine patchright
```

Or set a persistent default:

```bash
hedlis config set engine patchright
```

Config precedence: CLI flags > config file > built-in default (`playwright`).

The config file lives at `~/.config/hedlis/config.toml` (or `$XDG_CONFIG_HOME/hedlis/config.toml`).

## Chrome Profiles

List available Chrome profiles to find the right `--chrome-profile` value:

```bash
hedlis list-profiles
```

```
Default: Louai Misto
Profile 5: louai misto
Profile 7: pushrax
```

Use the directory name (left side) with `--chrome-profile`.

## Cookies

### Import from Chrome

Save cookies to `cookies/` for reuse across runs:

```bash
hedlis import-cookies --browser chrome --url https://x.com
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 2"
```

### Load at runtime only

Inject cookies for a single session without saving to disk:

```bash
hedlis --cookies-from-browser chrome --cookie-url https://x.com
hedlis --cookies-from-browser chrome --cookie-url https://x.com --chrome-profile "Profile 2"
```

### Cookie files

You can also place JSON cookie files directly in `cookies/`:

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

Notes:
- Browser-cookie access is always explicit
- Only Chrome is supported for browser-cookie import
- A closed Chrome instance usually gives the freshest on-disk cookie state

Known limitation:
`chrome-cookies-secure` may collapse same-name cookies across different paths or subdomains before `hedlis` sees them. If imported cookies look incomplete or login still fails, that may be the cause.

## Extensions

Put one or more `.zip` files in `extensions/`. Each zip must contain a Chrome extension with `manifest.json` at the zip root or one directory below. `hedlis` unpacks and loads them on launch.

The setup script downloads [OpenCLI](https://github.com/jackweren/opencli) automatically. To add more extensions, drop additional zips into `extensions/`.

## All Commands

```bash
hedlis                          # launch with defaults
hedlis --headless               # launch headless
hedlis --engine patchright      # launch with patchright
hedlis list-profiles            # show Chrome profiles
hedlis import-cookies ...       # save Chrome cookies to disk
hedlis config get engine        # show current engine
hedlis config set engine VALUE  # set default engine
hedlis config path              # show config file location
hedlis --help                   # full usage
```

## Developer Setup

```bash
npm install
npm run build
npm test
npm start -- --headless
```

To put the local checkout on your path:

```bash
npm link
```

CI runs `npm ci && npm test && npm run build` on pull requests and pushes to `main`.
