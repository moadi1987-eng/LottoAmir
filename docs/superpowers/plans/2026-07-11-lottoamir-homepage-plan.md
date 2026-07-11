# LottoAmir Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first publishable LottoAmir static site entry point with three clear tool links.

**Architecture:** Keep the existing tools as separate HTML pages and add one new root `index.html` as the home page. Add GitLab Pages configuration after the home page is verified, using a static artifact copy from the repository root.

**Tech Stack:** Static HTML, CSS, JavaScript-free navigation, Git, GitLab Pages.

## Global Constraints

- The site name is exactly `LottoAmir`.
- The first version has only three primary tools: `Lottery_V41_Final.html`, `Lotto_All_In_One.html`, and `lotto_analyzer.html`.
- `Lottery_V41_Final.html` is the main/latest version and should be visually emphasized.
- Do not merge or rewrite existing tool logic in the first step.
- Do not embed the tools in iframes in the first step.
- Use Hebrew right-to-left layout.
- The site must be static and suitable for GitLab Pages.

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

### Task 2: Add GitLab Pages Static Publishing Config

**Files:**
- Create: `.gitlab-ci.yml`

**Interfaces:**
- Consumes: static files in the project root.
- Produces: GitLab Pages artifact under `public/`.

- [ ] **Step 1: Create `.gitlab-ci.yml`**

Use a static Pages job that copies the publishable site files:

```yaml
pages:
  stage: deploy
  script:
    - mkdir -p public
    - cp index.html public/
    - cp Lottery_V41_Final.html public/
    - cp Lotto_All_In_One.html public/
    - cp lotto_analyzer.html public/
    - cp -f *.png public/ 2>/dev/null || true
    - cp -f *.json public/ 2>/dev/null || true
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

- [ ] **Step 2: Verify config mentions required files**

Run:

```powershell
Select-String -Path .\.gitlab-ci.yml -Pattern 'index.html','Lottery_V41_Final.html','Lotto_All_In_One.html','lotto_analyzer.html'
```

Expected: output contains all four file names.

- [ ] **Step 3: Commit**

Run:

```powershell
git add .gitlab-ci.yml
git commit -m "ci: add GitLab Pages publishing"
```

Expected: commit succeeds.

---

### Task 3: Prepare GitLab Remote Handoff

**Files:**
- Modify: none.

**Interfaces:**
- Consumes: the committed static site.
- Produces: a clean local Git repository ready for a GitLab remote once the project exists.

- [ ] **Step 1: Check repository status**

Run:

```powershell
git status --short
git log --oneline -3
```

Expected: working tree is clean after commits, and the latest commits include the homepage and GitLab Pages configuration.

- [ ] **Step 2: Record GitLab remote requirement**

There is no GitLab CLI available in this workspace at plan time. After the GitLab project is created, connect the local repository to the exact GitLab clone URL shown by GitLab.

Expected: the next execution stage either uses an authenticated GitLab tool, installs `glab`, or receives the exact GitLab clone URL from the user before running remote/push commands.

## Self-Review

- Spec coverage: Task 1 creates the LottoAmir home page with the three approved tools. Task 2 prepares static GitLab Pages publishing. Task 3 covers GitLab remote connection.
- Specificity scan: GitLab remote creation is intentionally left to the execution stage because no GitLab CLI is available locally and no exact clone URL exists yet.
- Scope check: The plan does not rewrite V41, All-In-One, or analyzer logic.
