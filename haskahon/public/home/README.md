# slinon.me — marketing site

Static site. No build step, no dependencies.

```
site/
├── index.html
├── styles.css
├── app.js
└── assets/slinon-logo.png
```

## Run locally

Open `index.html`, or:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Put it in your repo

```bash
git init
git add .
git commit -m "slinon marketing site"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

If the files live in a `site/` subfolder and you want the site at the repo root, move the four items up one level before committing.

## Deploy

- **GitHub Pages** — repo → Settings → Pages → Source: `main`, folder `/ (root)`. Add a `CNAME` file containing `slinon.me` and point a DNS CNAME at `<you>.github.io`.
- **Vercel / Netlify / Cloudflare Pages** — import the repo, no build command, publish directory = repo root (or `site`).

## Wiring up the signup form

Both email forms are stubbed in `app.js` (`[data-signup]` handler). Replace the commented `fetch` with a POST to your list provider or your own endpoint, and drop the fake "Sent ✓" state.

## Notes

- Fonts load from Google Fonts (Instrument Serif, IBM Plex Sans, IBM Plex Mono). Self-host them if you'd rather not hit a third party.
- Colors are CSS custom properties at the top of `styles.css` (`--brand`, `--accent`, backgrounds, ink levels).
- The logo is the dark-background PNG, blended with `mix-blend-mode: screen`. Swap in an SVG when you have one — same `img` tags in the header and footer.
- Copy is not investment advice and the footer says so; keep that if you're taking real signups.
