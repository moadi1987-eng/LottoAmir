# LottoAmir Mobile Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve LottoAmir's main page and analyzer mobile display without changing lottery logic or data flow.

**Architecture:** Keep the app as static GitHub Pages HTML. Add small, targeted responsive CSS classes and mobile media rules to `Lotto_All_In_One.html` and `lotto_analyzer.html`, preserving existing JavaScript, iframe communication, analysis, and form behavior.

**Tech Stack:** Static HTML, CSS media queries, existing JavaScript, GitHub Pages.

## Global Constraints

- Do not change lottery calculations, recommended combinations, saved data behavior, Excel parsing, printing behavior, or transfer-to-form behavior.
- Keep `index.html` opening `Lotto_All_In_One.html`.
- Keep the existing dark professional theme and design tokens.
- Avoid new dependencies and framework rewrites.
- Mobile improvements must avoid horizontal overflow and keep controls thumb-friendly.

---

### Task 1: Main ALL-IN-ONE Responsive Shell

**Files:**
- Modify: `Lotto_All_In_One.html`

**Interfaces:**
- Consumes: existing iframe IDs `formIframe` and `analyzerIframe`, section IDs `formSection` and `analyzerSection`, and existing `scrollToSection()` JavaScript.
- Produces: CSS hooks `.app-frame`, `.print-nav`, and mobile rules for compact sticky navigation and stable iframe sizing.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\Lotto_All_In_One.html
$hasShell = $html -match 'class="app-frame form-frame"' -and $html -match 'class="app-frame analyzer-frame"'
$hasMobileNav = $html -match '\.main-header \.nav-buttons\s*\{\s*display:\s*grid' -and $html -match '\.print-nav'
$hasMobileFrames = $html -match '#formIframe\s*\{\s*height:\s*calc\(100vh - 136px\)' -and $html -match '#analyzerIframe\s*\{\s*height:\s*calc\(100vh - 136px\)'
if ($hasShell -and $hasMobileNav -and $hasMobileFrames) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement responsive shell**

Add `.app-frame` styling, make the navigation grid-based on mobile, add class `print-nav` to the print button, and keep iframes scrollable with viewport-based mobile heights.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

---

### Task 2: Analyzer Mobile Controls And Tables

**Files:**
- Modify: `lotto_analyzer.html`

**Interfaces:**
- Consumes: existing upload controls, comparison controls, `NUMBERS.xlsx` loader, live comparison update, tables, cards, and combination cards.
- Produces: CSS hooks `.comparison-control-row`, `.quick-compare-row`, and `.compare-form-row`, plus responsive rules that wrap upload buttons, comparison controls, tables, and combination cards cleanly.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\lotto_analyzer.html
$hasClasses = $html -match 'class="comparison-control-row"' -and $html -match 'class="quick-compare-row"' -and $html -match 'class="compare-form-row"'
$hasUploadMobile = $html -match '\.file-input-wrapper\s*\{\s*display:\s*flex' -and $html -match '\.file-input-label\s*\{[^}]*min-height:\s*42px'
$hasCompareMobile = $html -match '\.comparison-control-row' -and $html -match 'grid-template-columns:\s*1fr 96px 1fr' -and $html -match '\.compare-form-row'
$hasTableMobile = $html -match '\.numbers-table\s*\{[^}]*overflow-x:\s*auto' -and $html -match '-webkit-overflow-scrolling:\s*touch'
if ($hasClasses -and $hasUploadMobile -and $hasCompareMobile -and $hasTableMobile) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement analyzer responsive rules**

Add the three comparison control classes to the existing HTML rows. Improve upload button wrapping, table horizontal scrolling, card overflow, and mobile grid behavior inside the existing media queries.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

---

### Task 3: Verification And Publish

**Files:**
- Verify: `Lotto_All_In_One.html`
- Verify: `lotto_analyzer.html`
- Commit: plan and HTML changes

**Interfaces:**
- Consumes: GitHub Pages deployment from branch `main`.
- Produces: public site with improved mobile display.

- [ ] **Step 1: Run syntax and diff checks**

```powershell
git diff --check
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -e "const fs=require('fs'); for (const file of ['Lotto_All_In_One.html','lotto_analyzer.html']) { const html=fs.readFileSync(file,'utf8'); const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).join('\n'); new Function(scripts); } console.log('PASS: inline JavaScript parses');"
```

Expected: both commands exit `0`.

- [ ] **Step 2: Commit and push**

```powershell
git add Lotto_All_In_One.html lotto_analyzer.html docs/superpowers/plans/2026-07-11-lottoamir-mobile-display-plan.md
git commit -m "feat: improve mobile display"
git push
```

Expected: push succeeds.

- [ ] **Step 3: Verify GitHub Pages**

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' api repos/moadi1987-eng/LottoAmir/pages --jq '.status + " " + .html_url'
$root = Invoke-WebRequest -Uri 'https://moadi1987-eng.github.io/LottoAmir/' -UseBasicParsing
$all = Invoke-WebRequest -Uri ('https://moadi1987-eng.github.io/LottoAmir/Lotto_All_In_One.html?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing
$analyzer = Invoke-WebRequest -Uri ('https://moadi1987-eng.github.io/LottoAmir/lotto_analyzer.html?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing
```

Expected: Pages status is `built`, root still opens `Lotto_All_In_One.html`, and public HTML contains the responsive hooks.

## Self-Review

- Spec coverage: Implements first-stage display improvements for `Lotto_All_In_One.html` and `lotto_analyzer.html`.
- Scope check: No calculation, parsing, printing, or transfer behavior changes are included.
- Placeholder scan: No TBD/TODO placeholders remain.
