# LottoAmir Built-In Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the built-in 10-table and 14-table form images and make V41 load them by default.

**Architecture:** Keep form filler logic in `Lottery_V41_Final.html`. Add a small `DEFAULT_FORM_IMAGES` map, use localStorage uploads as overrides, and fall back to the built-in PNG path for each form type. Track only `10.png` and `14.png` while leaving other local PNGs ignored.

**Tech Stack:** Static HTML, browser localStorage, CSS background images, GitHub Pages.

## Global Constraints

- `long` form type uses `14.png`.
- `short` form type uses `10.png`.
- User-uploaded form images override the built-in defaults.
- The ALL-IN-ONE page inherits the behavior through its iframe.
- The site remains static and is published from GitHub Pages branch `main` path `/`.

---

### Task 1: Add Built-In Form Defaults

**Files:**
- Modify: `Lottery_V41_Final.html`
- Modify: `.gitignore`
- Add: `10.png`
- Add: `14.png`

**Interfaces:**
- Consumes: `10.png`, `14.png`, existing `STORAGE_KEYS.imageLong`, existing `STORAGE_KEYS.imageShort`.
- Produces: `DEFAULT_FORM_IMAGES = { long: '14.png', short: '10.png' }` and fallback loading through `setFormImage(DEFAULT_FORM_IMAGES[type])`.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\Lottery_V41_Final.html
$ok = $html -match "DEFAULT_FORM_IMAGES" -and $html -match "long:\s*'14\.png'" -and $html -match "short:\s*'10\.png'" -and $html -match "setFormImage\(DEFAULT_FORM_IMAGES\[type\]\)"
if (-not $ok) { exit 1 }
```

Expected: exits `1` before implementation.

- [ ] **Step 2: Implement defaults**

Add:

```javascript
const DEFAULT_FORM_IMAGES = {
    long: '14.png',
    short: '10.png'
};
```

Then make `setFormType(type)` load localStorage first and `DEFAULT_FORM_IMAGES[type]` second.

- [ ] **Step 3: Allow the two assets through `.gitignore`**

Add after `*.png`:

```gitignore
!10.png
!14.png
```

- [ ] **Step 4: Run GREEN tests**

```powershell
$html = Get-Content -Raw .\Lottery_V41_Final.html
$ok = $html -match "DEFAULT_FORM_IMAGES" -and $html -match "long:\s*'14\.png'" -and $html -match "short:\s*'10\.png'" -and $html -match "setFormImage\(DEFAULT_FORM_IMAGES\[type\]\)"
if (-not $ok) { exit 1 }
git check-ignore -q 10.png
if ($LASTEXITCODE -eq 0) { exit 1 }
git check-ignore -q 14.png
if ($LASTEXITCODE -eq 0) { exit 1 }
```

Expected: exits `0` after implementation.

- [ ] **Step 5: Commit and push**

```powershell
git add Lottery_V41_Final.html .gitignore 10.png 14.png docs/superpowers/specs/2026-07-11-lottoamir-built-in-forms-design.md docs/superpowers/plans/2026-07-11-lottoamir-built-in-forms-plan.md
git commit -m "feat: add built-in lotto form images"
git push
```

Expected: push succeeds.

## Self-Review

- Spec coverage: The plan maps long to `14.png`, short to `10.png`, preserves uploaded overrides, and publishes both images.
- Placeholder scan: No TBD/TODO placeholders remain.
- Scope check: The plan does not rewrite the form filler or ALL-IN-ONE layout.
