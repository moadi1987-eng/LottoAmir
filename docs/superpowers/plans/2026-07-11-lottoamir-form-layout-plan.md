# LottoAmir Form Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the tickets list above calibration and keep advanced calibration settings collapsed by default.

**Architecture:** Make a minimal static HTML reorder in `Lottery_V41_Final.html`. Keep all existing IDs, event handlers, localStorage keys, calibration inputs, and ticket rendering targets unchanged.

**Tech Stack:** Static HTML, existing JavaScript, GitHub Pages.

## Global Constraints

- Do not change ticket generation, print behavior, calibration math, saved calibration, uploaded form images, or iframe communication.
- Keep the `ticketsList` element ID unchanged.
- Keep calibration controls and advanced inputs unchanged.
- Only change section order and the default open state of the advanced settings `<details>`.

---

### Task 1: Reorder Form Sections

**Files:**
- Modify: `Lottery_V41_Final.html`

**Interfaces:**
- Consumes: existing `ticketsList` target and existing calibration controls.
- Produces: tickets section before calibration section; advanced settings collapsed by default.

- [ ] **Step 1: Run RED test**

```powershell
$html = Get-Content -Raw .\Lottery_V41_Final.html
$cardsIdx = $html.IndexOf('<!-- רשימת כרטיסים -->')
$calibIdx = $html.IndexOf('<!-- כיול -->')
$advanced = [regex]::Match($html, '<details[^>]*>\s*<summary[^>]*>📐 הגדרות מתקדמות')
$cardsBeforeCalib = $cardsIdx -ge 0 -and $calibIdx -ge 0 -and $cardsIdx -lt $calibIdx
$advancedCollapsed = $advanced.Success -and $advanced.Value -notmatch '<details\s+open'
if ($cardsBeforeCalib -and $advancedCollapsed) { exit 0 } else { exit 1 }
```

Expected before implementation: exits `1`.

- [ ] **Step 2: Implement minimal HTML change**

Move the `<!-- רשימת כרטיסים -->` section so it appears immediately before `<!-- כיול -->`. Change `<details open>` to `<details>`.

- [ ] **Step 3: Run GREEN test**

Run the same PowerShell test from Step 1.

Expected after implementation: exits `0`.

- [ ] **Step 4: Verify and publish**

Run `git diff --check`, parse inline JavaScript with Node, commit, push, and verify GitHub Pages serves the new HTML.

## Self-Review

- Spec coverage: Implements both requested display changes.
- Scope check: No JavaScript behavior or IDs are changed.
- Placeholder scan: No placeholders remain.
