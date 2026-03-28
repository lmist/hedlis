# Usage

## Install

```bash
bun install
bunx patchright install chromium
bun run build
```

## Help

```bash
hedlis
```

## List profiles

```bash
hedlis list-profiles
```

## Import cookies

```bash
hedlis import-cookies --browser chrome --url https://instagram.com --chrome-profile "Profile 1"
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 1"
hedlis import-cookies --browser chrome --url https://youtube.com --chrome-profile "Profile 1"
hedlis import-cookies --browser chrome --url https://x.com --chrome-profile "Profile 1" --output ./exports/x.json
```

## Run Patchright

```bash
hedlis run
hedlis run -w
hedlis run --cookies-from-browser chrome --cookie-url https://x.com --chrome-profile "Profile 1"
```
