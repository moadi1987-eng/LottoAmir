# LottoAmir Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first publishable LottoAmir static site entry point with three clear tool links.

**Architecture:** Keep the existing tools as separate HTML pages and add one new root `index.html` as the home page. Track the three publishable tool files in Git because this repository was initialized from an existing local folder. Publish through GitHub Pages directly from the `main` branch root.

**Tech Stack:** Static HTML, CSS, JavaScript-free navigation, Git, GitHub Pages.

## Global Constraints

- The site name is exactly `LottoAmir`.
- The first version has only three primary tools: `Lottery_V41_Final.html`, `Lotto_All_In_One.html`, and `lotto_analyzer.html`.
- `Lottery_V41_Final.html` is the main/latest version and should be visually emphasized.
- Do not merge or rewrite existing tool logic in the first step.
- Do not embed the tools in iframes in the first step.
- Use Hebrew right-to-left layout.
- The site must be static and suitable for GitHub Pages.
- The GitHub owner is `moadi1987-eng`.

---

### Task 1: Create The LottoAmir Home Page

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: existing HTML tool files in the project root.
- Produces: a root `index.html` page linking to the three tool files.

- [ ] **Step 1: Confirm target files exist**

Run:

```powershell
Test-Path .\Lottery_V41_Final.html
Test-Path .\Lotto_All_In_One.html
Test-Path .\lotto_analyzer.html
```

Expected:

```text
True
True
True
```

- [ ] **Step 2: Create `index.html`**

Create a single static HTML page with:

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LottoAmir</title>
</head>
<body>
  <main>
    <h1>LottoAmir</h1>
    <a href="Lottery_V41_Final.html">לוטו PRO V41</a>
    <a href="Lotto_All_In_One.html">ALL-IN-ONE</a>
    <a href="lotto_analyzer.html">ניתוח תוצאות</a>
  </main>
</body>
</html>
```

The final implementation should expand this skeleton with polished responsive styling, Hebrew copy, accessibility labels, and clear emphasis on V41.

- [ ] **Step 3: Verify links exist in the page**

Run:

```powershell
Select-String -Path .\index.html -Pattern 'Lottery_V41_Final.html','Lotto_All_In_One.html','lotto_analyzer.html'
```

Expected: output contains all three file names.

- [ ] **Step 4: Commit**

Run:

```powershell
git add index.html
git commit -m "feat: add LottoAmir homepage"
```

Expected: commit succeeds.

---

### Task 2: Track The Published Tool Pages

**Files:**
- Add: `Lottery_V41_Final.html`
- Add: `Lotto_All_In_One.html`
- Add: `lotto_analyzer.html`

**Interfaces:**
- Consumes: existing local tool pages.
- Produces: committed tool pages that GitHub Pages can publish.

- [ ] **Step 1: Confirm all three tool pages are untracked or modified**

Run:

```powershell
git status --short -- Lottery_V41_Final.html Lotto_All_In_One.html lotto_analyzer.html
```

Expected: output lists the three files.

- [ ] **Step 2: Commit the three publishable tools**

Run:

```powershell
git add Lottery_V41_Final.html Lotto_All_In_One.html lotto_analyzer.html
git commit -m "feat: add published LottoAmir tools"
```

Expected: commit succeeds.

---

### Task 3: Add GitHub Pages Static Publishing Setup

**Files:**
- Create: `.nojekyll`

**Interfaces:**
- Consumes: static files in the project root.
- Produces: a repository root that GitHub Pages can serve directly.

- [ ] **Step 1: Create `.nojekyll`**

Create an empty `.nojekyll` file so GitHub Pages serves the static HTML files directly without Jekyll processing.

```powershell
New-Item -ItemType File -Path .\.nojekyll
```

- [ ] **Step 2: Verify static entry files exist**

Run:

```powershell
Test-Path .\.nojekyll
Test-Path .\index.html
Test-Path .\Lottery_V41_Final.html
Test-Path .\Lotto_All_In_One.html
Test-Path .\lotto_analyzer.html
```

Expected: five `True` lines.

- [ ] **Step 3: Commit**

Run:

```powershell
git add .nojekyll
git commit -m "chore: prepare GitHub Pages static publishing"
```

Expected: commit succeeds.

---

### Task 4: Prepare GitHub Remote Handoff

**Files:**
- Modify: none.

**Interfaces:**
- Consumes: the committed static site.
- Produces: a clean local Git repository ready for a GitHub remote once the project exists.

- [ ] **Step 1: Check repository status**

Run:

```powershell
git status --short
git log --oneline -3
```

Expected: working tree is clean after commits, and the latest commits include the homepage and static GitHub Pages setup.

- [ ] **Step 2: Record GitHub remote requirement**

There is no GitHub CLI available in this workspace at plan time. After the GitHub repository is created under `moadi1987-eng`, connect the local repository to the exact GitHub clone URL shown by GitHub.

Expected: the next execution stage either installs/authenticates `gh`, uses an authenticated GitHub connector, or receives the exact GitHub clone URL from the user before running remote/push commands. After push, GitHub Pages should be configured with source branch `main` and path `/`.

## Self-Review

- Spec coverage: Task 1 creates the LottoAmir home page with the three approved tools. Task 2 tracks the three tool pages so GitHub can publish them. Task 3 prepares static GitHub Pages publishing from the repository root. Task 4 covers GitHub remote connection.
- Specificity scan: GitHub remote creation is intentionally left to the execution stage because no GitHub CLI is available locally and no exact clone URL exists yet.
- Scope check: The plan does not rewrite V41, All-In-One, or analyzer logic.
