# opencli-sidecar

Launches Playwright's bundled Chromium with browser extensions and cookies pre-loaded. Runs until you kill it.

## Setup

```
npm install
npx playwright install chromium
```

## Usage

``` 
npm start
npm start -- --headless
```

### Extensions

Drop `.zip` files into `extensions/`. Each zip should contain a Chrome extension (with `manifest.json` at root or one level deep). They get unzipped to a temp dir and loaded into Chromium on launch.

### Cookies

Drop `.json` files into `cookies/` — one file per site, or however you want to organize them. The loader accepts both Playwright cookie JSON and common browser-export JSON, and normalizes browser-export fields automatically.

Playwright-format example:

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

All cookie files get merged and injected into the browser context on startup.

### Stopping

Ctrl+C or close the browser window.
