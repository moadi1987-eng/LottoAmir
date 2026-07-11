# LottoAmir Shell Navigation And Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main-shell analyzer navigation rail and make the shell/analyzer use the available screen width.

**Architecture:** Keep the current iframe architecture. Add parent-level navigation in `Lotto_All_In_One.html` that calls existing analyzer iframe section scrolling. Add CSS hooks so the parent rail is right-side on desktop and bottom on mobile. Update `lotto_analyzer.html` width and embedded side-nav behavior.

**Tech Stack:** Static HTML, CSS media queries, existing JavaScript, GitHub Pages.

## Global Constraints

- Do not change form print dimensions.
- Do not change analyzer calculations, comparison math, Excel parsing, saved data, or transfer message payloads.
- Keep existing analyzer section IDs unchanged.
- No new dependencies.

---

### Task 1: Parent Analyzer Rail And Full-Width Shell

**Files:**
- Modify: `Lotto_All_In_One.html`

**Interfaces:**
- Consumes: existing analyzer iframe ID `analyzerIframe`.
- Produces: `goToAnalyzerSection(sectionId)` and `.analyzer-rail` navigation.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\Lotto_All_In_One.html
$hasRail = $html -match 'id="analyzerRail"' -and $html -match 'class="analyzer-rail-btn"' -and $html -match 'data-target="comparisonCard"'
$hasRailCss = $html -match '\.analyzer-rail' -and $html -match 'body\.shell-analyzer-active \.analyzer-rail' -and $html -match '@media \(max-width: 768px\)[\s\S]*bottom: 0'
$hasWidth = $html -match 'max-width:\s*none' -and $html -match 'body\.shell-analyzer-active \.content-wrapper'
$hasJs = $html -match 'function goToAnalyzerSection\(sectionId\)' -and $html -match 'function setEmbeddedAnalyzerMode\(\)' -and $html -match 'body\.classList\.toggle\('
if ($hasRail -and $hasRailCss -and $hasWidth -and $hasJs) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement shell rail**

Add `.analyzer-rail` markup after the main header. Add CSS for desktop right rail and mobile bottom rail. Add full-width shell rules. Add `goToAnalyzerSection(sectionId)` and set `shell-analyzer-active` on the body when analyzer/compare is active.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

---

### Task 2: Analyzer Full-Width And Embedded Rail Hiding

**Files:**
- Modify: `lotto_analyzer.html`

**Interfaces:**
- Consumes: parent shell adding `body.embedded-shell`.
- Produces: full-width analyzer container and hidden internal `.side-nav` when embedded.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\lotto_analyzer.html
$hasWidth = $html -match '\.container\s*\{[\s\S]*max-width:\s*none' -and $html -match '\.container\s*\{[\s\S]*width:\s*100%'
$hasEmbedded = $html -match 'body\.embedded-shell \.side-nav' -and $html -match 'display:\s*none !important'
if ($hasWidth -and $hasEmbedded) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement analyzer width and embedded side-nav hiding**

Set analyzer `.container` to full width. Add `body.embedded-shell .side-nav { display: none !important; }`.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

---

### Task 3: Verify And Publish

**Files:**
- Verify: `Lotto_All_In_One.html`
- Verify: `lotto_analyzer.html`

- [ ] **Step 1: Run syntax and diff checks**

```powershell
git diff --check
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -e "const fs=require('fs'); for (const file of ['Lotto_All_In_One.html','lotto_analyzer.html']) { const html=fs.readFileSync(file,'utf8'); const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).join('\n'); new Function(scripts); } console.log('PASS: inline JavaScript parses');"
```

Expected: both commands exit `0`.

- [ ] **Step 2: Commit and push**

```powershell
git add Lotto_All_In_One.html lotto_analyzer.html docs/superpowers/specs/2026-07-11-lottoamir-shell-nav-width-design.md docs/superpowers/plans/2026-07-11-lottoamir-shell-nav-width-plan.md
git commit -m "feat: add shell analyzer rail"
git push
```

Expected: push succeeds.

- [ ] **Step 3: Verify public Pages**

Verify GitHub Pages is `built`, root opens `ALL_IN_ONE`, public shell includes `analyzerRail`, and public analyzer includes `embedded-shell` side-nav hiding.

## Self-Review

- Spec coverage: Implements shell rail, mobile bottom rail, width adaptation, and embedded side-nav hiding.
- Scope check: Does not change analysis or form behavior.
- Placeholder scan: No placeholders remain.
