# LottoAmir Built-In Forms Design

## Goal

Add built-in form images to LottoAmir so users do not need to upload form backgrounds manually before using the form filler.

## Behavior

- `Lottery_V41_Final.html` should load `14.png` by default for the regular long Lotto form.
- `Lottery_V41_Final.html` should load `10.png` by default for the short Double Lotto form.
- If a user uploads a custom image, the uploaded localStorage image should override the built-in default for that form type.
- Clearing saved images should remove uploaded overrides and return the current form type to its built-in default image.
- `Lotto_All_In_One.html` should inherit the behavior automatically because it embeds `Lottery_V41_Final.html`.

## Publishing

- `10.png` and `14.png` must be tracked in Git and published to GitHub Pages.
- `.gitignore` should continue ignoring general local PNG files while explicitly allowing these two built-in assets.

## Verification

- A text-level test should confirm `Lottery_V41_Final.html` maps `long` to `14.png` and `short` to `10.png`.
- A text-level test should confirm the fallback code calls `setFormImage(DEFAULT_FORM_IMAGES[type])`.
- A Git test should confirm `10.png` and `14.png` are not ignored.
- A public HTTP check should confirm both image URLs return `200` after publishing.
