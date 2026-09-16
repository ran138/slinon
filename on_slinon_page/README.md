# Slinon company website — local redesign

Static Hebrew company website. No build step and no dependencies.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

- `index.html` — semantic site content and metadata
- `styles.css` — responsive visual system and layouts
- `app.js` — mobile navigation, reveal motion and product-preview interaction
- `assets/slinon-logo.png` — existing Slinon brand asset from the repository
- `assets/slinon-tab-logo.png` — official Slinon logo used for the browser tab icon
- `favicon.svg` — local favicon

## Before production deployment

1. Expand Lara's short bio when her final copy arrives. Ran's supplied bio and Dor's latest available paragraph are presented as bullet points.
2. Confirm the final contact method if one should be added.
3. Add canonical and URL-dependent Open Graph metadata after the permanent company URL is selected.
4. Confirm that `https://slinon.me/` remains the intended Vestory marketing destination.

No live repository, hosting, DNS or production settings were changed.
