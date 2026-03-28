# Usage

## Import cookies and launch with Patchright

Import Instagram cookies from a specific Chrome profile, then launch with the Patchright engine:

```bash
hedlis import-cookies --browser chrome --url https://instagram.com --chrome-profile "Profile 7"
hedlis --engine patchright
```

## List Chrome profiles

Find the right `--chrome-profile` value:

```bash
hedlis list-profiles
```
