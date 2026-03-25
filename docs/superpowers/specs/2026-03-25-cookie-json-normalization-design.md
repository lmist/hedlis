# Cookie JSON Normalization Design

**Goal:** Accept common browser-export JSON cookie files in `cookies/` without requiring manual conversion.

**Design:** Keep the existing `cookies/` contract based on `.json` files, but normalize browser-export entries in memory before they reach Playwright. Existing Playwright-format cookie arrays continue to load unchanged. Browser-only fields are ignored.

**Normalization rules:**
- `expirationDate` -> `expires`
- `sameSite: "no_restriction"` -> `"None"`
- `sameSite: "lax"` -> `"Lax"`
- `sameSite: "strict"` -> `"Strict"`
- `sameSite: "unspecified"` or missing -> omit `sameSite`
- Ignore exporter-specific fields such as `hostOnly`, `session`, and `storeId`

**Scope:** JSON browser exports plus existing Playwright JSON only. Netscape and header-string formats remain unsupported.
