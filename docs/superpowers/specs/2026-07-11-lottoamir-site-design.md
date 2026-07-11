# LottoAmir Site Design

## Goal

Create a clean static website named **LottoAmir** that can be published through GitHub Pages under the GitHub account `moadi1987-eng`. The site should present only the three important tools and avoid exposing the older historical versions as primary choices.

## Primary Experience

The website entry point will be `index.html`. It will redirect directly to `Lotto_All_In_One.html`, because the preferred default experience is the combined ALL-IN-ONE workflow.

The previous professional home page and navigation hub will remain available as `hub.html` for:

1. **Lotto PRO V41**  
   Opens `Lottery_V41_Final.html`. This is the main/latest version and should be visually treated as the primary tool.

2. **ALL-IN-ONE**  
   Opens `Lotto_All_In_One.html`. This is the combined fill-and-analysis workflow.

3. **Result Analysis**  
   Opens `lotto_analyzer.html`. This is the detailed result analysis tool.

## Site Structure

The first version will keep the existing tools as separate HTML pages. The home page will link to them directly instead of embedding them in iframes. This keeps each tool stable, preserves localStorage behavior, and avoids layout bugs from nested scrolling.

Recommended file layout for the publishable version:

- `index.html` - direct redirect to ALL-IN-ONE.
- `hub.html` - LottoAmir home page and tool hub.
- `Lottery_V41_Final.html` - primary V41 tool.
- `Lotto_All_In_One.html` - all-in-one tool.
- `lotto_analyzer.html` - result analysis tool.
- Existing support files remain in place for now.

## Visual Direction

The home page should feel like a compact professional tool hub, not a marketing landing page. It should use Hebrew right-to-left layout, clear cards for the three tools, strong hierarchy, and a restrained modern color palette.

The V41 card should be visually emphasized as the recommended/default entry. The other two tools should be equal secondary actions.

## GitHub Publishing

The project will be initialized as a Git repository locally, then connected to a new GitHub repository owned by `moadi1987-eng`. GitHub Pages will publish directly from the `main` branch root after the home page works locally.

Because the site is static HTML, GitHub Pages can publish it without a build step. The Pages source should be `main` with path `/`, and `index.html` should stay at the repository root.

## Out of Scope For First Step

- Merging the three tools into one codebase.
- Rewriting the existing V41, All-In-One, or analyzer logic.
- Removing old versions from the folder before the new home page is tested.
- Adding backend data storage or login.

## Verification

Before publishing, verify:

- `index.html` opens locally.
- All three links open the correct HTML files.
- The home page works on desktop and mobile widths.
- Hebrew text direction is correct.
- No existing tool behavior is changed by the home page.
