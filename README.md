<!-- Generated from README.org by scripts/render-readme.cjs. Do not edit README.md directly. -->

![cloak logo](docs/assets/cloak-logo-readme-centered.png)

# what it is

`cloak` is the browser sidecar for [OpenCLI](https://github.com/jackwener/opencli). It launches a fresh [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/) browser with the pinned [OpenCLI extension archive](https://github.com/jackwener/opencli/releases/download/v1.6.8/opencli-extension.zip) loaded every time it starts.

# install

Install `cloak` globally and verify the CLI:

``` bash
npm install -g @lmist/cloak
cloak --help
```

During `npm install`, `cloak` tries to:

- warm the pinned OpenCLI extension cache
- install the Patchright Chromium browser

If the browser download step gets skipped or fails in your environment, retry it manually:

``` bash
npx patchright install chromium
```

If you use OpenCLI with it, install that separately:

``` bash
npm install -g @jackwener/opencli
npx skills add jackwener/opencli
```

# usage

If you installed from a checkout but did not run `npm install -g .`, use `node dist/main.js` everywhere below in place of `cloak`.

Discover Chrome profiles and their cookie-bearing sites:

``` bash
cloak profiles list
```

In an interactive terminal that opens a searchable picker. In a non-interactive terminal it prints a plain-text report grouped by profile.

Start a clean headless browser:

``` bash
cloak run
```

Start a visible window instead of headless mode:

``` bash
cloak run --window
```

Let `cloak` pick a Chrome site interactively and inject cookies for a single run:

``` bash
cloak run --cookies-from-browser chrome
```

Offer to persist the imported cookies after `cloak` reads them:

``` bash
cloak run --cookies-from-browser chrome --persist-cookies
```

If you accept the prompt, `cloak` writes the imported cookie set under `~/.config/cloak/cookies/`, named after the site hostname. For example: `~/.config/cloak/cookies/x.com.json`.

Use an explicit site URL and Chrome profile when you already know the target or when you are scripting it:

``` bash
cloak run --cookies-from-browser chrome --cookie-url https://x.com --chrome-profile "Default"
```

Use this smoke test if you want a non-interactive startup check that exits automatically instead of waiting for Ctrl+C:

``` bash
set -euo pipefail

if command -v cloak >/dev/null 2>&1; then
  run_cloak() {
    cloak "$@"
  }
else
  run_cloak() {
    node dist/main.js "$@"
  }
fi

log_file="$(mktemp)"
cleanup() {
  rm -f "$log_file"
}
trap cleanup EXIT

run_cloak run >"$log_file" 2>&1 &
pid=$!
sleep 5
kill -INT "$pid" || true
wait "$pid" || true
cat "$log_file"
```

For local development inside the repository:

``` bash
set -euo pipefail

npm test
npm run typecheck
npm run build

if command -v make >/dev/null 2>&1; then
  make ci
fi

if command -v just >/dev/null 2>&1; then
  just ci
fi
```

# runtime and storage

`cloak` launches headless by default. Pass `--window` when you want a visible browser window.

If you import Chrome cookies, `cloak` reads them from the selected local Chrome profile at startup, injects them into the fresh browser context for that run, and does not write them back out unless you opt in with `--persist-cookies`.

What persists:

- `~/.cache/cloak/opencli-extension.zip`
- if you accept the `--persist-cookies` prompt, cookie snapshots under `~/.config/cloak/cookies/` named after the site hostname, for example `~/.config/cloak/cookies/x.com.json`

What stays ephemeral:

- the extracted extension directory in the OS temp directory
- the Patchright user data directory in the OS temp directory
- the injected cookie set

# build from source

If you want to work on `cloak` itself, use the repository directly:

``` bash
git clone https://github.com/lmist/cloak.git
cd cloak
npm install
npm run build
node dist/main.js --help
```

If you want a global `cloak` command built from that checkout:

``` bash
npm install -g .
cloak --help
```

# one sharp edge

Chrome cookie extraction depends on `chrome-cookies-secure`, and that tool can collapse same-name cookies across different paths or subdomains before `cloak` sees them. If a login still fails after injection, that is the first thing to suspect.

If `cloak run --cookies-from-browser chrome` tells you Chrome cookie support is unavailable, reinstall in an environment where the optional native dependency chain can be built successfully.
