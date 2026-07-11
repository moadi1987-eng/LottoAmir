# LottoAmir Default Numbers File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `NUMBERS.xlsx` and connect it to `lotto_analyzer.html` as a built-in data source.

**Architecture:** Keep the analyzer as a static browser app. Use `fetch('NUMBERS.xlsx')` to load the workbook from the same GitHub Pages origin, parse it with the already-loaded SheetJS library, and reuse the existing analysis pipeline.

**Tech Stack:** Static HTML, SheetJS, GitHub Pages, Excel `.xlsx`.

## Global Constraints

- Keep manual file upload working.
- Add `NUMBERS.xlsx` as a built-in data source.
- Do not implement the weekly Pais update in this task.
- The site remains static and is published from GitHub Pages branch `main` path `/`.

---

### Task 1: Publish And Load Default Numbers

**Files:**
- Modify: `.gitignore`
- Modify: `lotto_analyzer.html`
- Add: `NUMBERS.xlsx`

**Interfaces:**
- Consumes: `NUMBERS.xlsx` at the site root.
- Produces: `DEFAULT_NUMBERS_FILE = 'NUMBERS.xlsx'` and a `loadDefaultNumbersFile()` browser function.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\lotto_analyzer.html
$hasCode = $html -match "DEFAULT_NUMBERS_FILE\s*=\s*'NUMBERS\.xlsx'" -and $html -match "loadDefaultNumbersFile" -and $html -match "fetch\(DEFAULT_NUMBERS_FILE"
git check-ignore -q NUMBERS.xlsx
$isIgnored = $LASTEXITCODE -eq 0
if ($hasCode -and -not $isIgnored) { exit 0 } else { exit 1 }
```

Expected: exits `1` before implementation.

- [ ] **Step 2: Implement default loading**

Add a built-in data button next to the upload button. Add `DEFAULT_NUMBERS_FILE`, `loadedExcelRows`, `readExcelArrayBuffer()`, and `loadDefaultNumbersFile()`. Reuse the existing analysis flow so the loaded rows can be analyzed by the current "נתח עכשיו" button.

- [ ] **Step 3: Allow `NUMBERS.xlsx` through `.gitignore`**

Add:

```gitignore
!NUMBERS.xlsx
```

- [ ] **Step 4: Run GREEN test**

```powershell
$html = Get-Content -Raw .\lotto_analyzer.html
$hasCode = $html -match "DEFAULT_NUMBERS_FILE\s*=\s*'NUMBERS\.xlsx'" -and $html -match "loadDefaultNumbersFile" -and $html -match "fetch\(DEFAULT_NUMBERS_FILE"
git check-ignore -q NUMBERS.xlsx
$isIgnored = $LASTEXITCODE -eq 0
if ($hasCode -and -not $isIgnored) { exit 0 } else { exit 1 }
```

Expected: exits `0` after implementation.

- [ ] **Step 5: Commit and push**

```powershell
git add .gitignore lotto_analyzer.html NUMBERS.xlsx docs/superpowers/specs/2026-07-11-lottoamir-default-numbers-design.md docs/superpowers/plans/2026-07-11-lottoamir-default-numbers-plan.md
git commit -m "feat: add built-in numbers workbook"
git push
```

Expected: push succeeds.

## Self-Review

- Spec coverage: The plan publishes `NUMBERS.xlsx`, adds a built-in analyzer loader, and keeps manual upload working.
- Placeholder scan: No TBD/TODO placeholders remain.
- Scope check: Weekly Pais automation remains a separate follow-up step.
