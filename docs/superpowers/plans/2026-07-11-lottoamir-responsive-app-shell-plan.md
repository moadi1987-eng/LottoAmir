# LottoAmir Responsive App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `Lotto_All_In_One.html` into a screen-fitted app shell with top navigation between forms, analysis, and comparison.

**Architecture:** Keep the existing static HTML and iframe architecture. Add active-view CSS, viewport-height CSS variables, and small navigation JavaScript in the parent shell only.

**Tech Stack:** Static HTML, CSS custom properties, existing JavaScript, GitHub Pages.

## Global Constraints

- Do not change form filler logic, analyzer logic, Excel loading, comparison math, printing, or transfer message payloads.
- Keep the existing iframe IDs `formIframe` and `analyzerIframe`.
- Keep the existing section IDs `formSection` and `analyzerSection`.
- No new dependencies.

---

### Task 1: Screen-Fitted App Shell

**Files:**
- Modify: `Lotto_All_In_One.html`

**Interfaces:**
- Consumes: existing `scrollToSection('form')`, `scrollToSection('analyzer')`, `transferToForm()`, and `fillAllTablesToForm()` flows.
- Produces: `setActiveSection(section, options)`, `openComparisonView()`, and `updateViewportMetrics()` functions.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\Lotto_All_In_One.html
$hasCss = $html -match '--app-height' -and $html -match '\.section-container\.is-active' -and $html -match '\.app-frame\s*\{[^}]*flex:\s*1'
$hasNav = $html -match 'id="navFormBtn"' -and $html -match 'id="navAnalyzerBtn"' -and $html -match 'id="navCompareBtn"'
$hasJs = $html -match 'function setActiveSection\(section, options\)' -and $html -match 'function openComparisonView\(\)' -and $html -match 'function updateViewportMetrics\(\)' -and $html -match 'visualViewport'
$hasActiveDefault = $html -match 'id="formSection"[^>]*is-active'
if ($hasCss -and $hasNav -and $hasJs -and $hasActiveDefault) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement app shell**

Add CSS variables for viewport/header height, active section layout, iframe flex sizing, four top navigation buttons, active state management, comparison navigation, and viewport resize handling.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

- [ ] **Step 4: Verify and publish**

Run `git diff --check`, parse inline JavaScript with Node, commit, push, and verify public GitHub Pages HTML contains the new shell hooks.

## Self-Review

- Spec coverage: Implements screen-fit app shell, top navigation, comparison shortcut, and viewport sizing.
- Scope check: Only parent shell behavior changes.
- Placeholder scan: No placeholders remain.
