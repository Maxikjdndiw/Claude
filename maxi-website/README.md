# Maxi's website

A small personal scrapbook site. It's plain HTML, CSS and JavaScript: no framework, no build step, no tracking.

```
index.html              the whole page (all text lives here)
css/styles.css          design: colors, fonts, layout, photo look
js/main.js              lightbox, postcard fan, route animation
assets/fonts/           self-hosted fonts (Fraunces, Space Mono, Caveat, all SIL OFL)
assets/photos-source/   original photos + README.md with captions
assets/photos/          generated sizes (do not edit by hand)
tools/make-sizes.py     generates assets/photos/ and og-image.jpg
favicon.svg, og-image.jpg, netlify.toml
```

## Run it locally

```bash
cd maxi-website
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also mostly works, but a local server is closer to the real site.

## Edit text

All text is in `index.html`. Each part of the page is a `<section class="tile ...">` with a comment above it (`<!-- HERO -->`, `<!-- ABOUT -->`, ...). Change the words between the tags and save.

- Photo captions in the lightbox are the `data-caption="..."` attributes.
- Alt text (what screen readers read out) is the `alt="..."` on each `<img>`. Keep it short and describe what is in the photo.
- Captions for the 18 travel photos in the "See all" gallery are in the `<script id="gallery-travel">` block inside the travel tile.
- House style: no em dashes or en dashes in the copy. Use commas, colons or periods.

Colors and fonts are CSS variables at the top of `css/styles.css` (`--paper`, `--beige`, `--ink`, `--forest`, `--rust`, `--mustard`, `--teal`).

## Add photos

1. Put the new JPEG in `assets/photos-source/` (a short lowercase name, for example `img_8001.jpg`). Remove location data first if your phone adds it; the generated files never contain metadata.
2. Generate the sizes (needs Python 3 and Pillow):
   ```bash
   pip install Pillow
   python3 tools/make-sizes.py
   ```
3. Print a ready-to-paste `<picture>` tag:
   ```bash
   python3 tools/make-sizes.py --snippet img_8001 "Short description of the photo"
   ```
4. To make it open in the lightbox, wrap it like the other photos:
   ```html
   <a class="lb film" href="assets/photos/img_8001-1600.webp" data-group="school"
      data-caption="Your caption" data-w="1350" data-h="1800">
     ...picture tag from step 3...
   </a>
   ```
   `data-group` decides which photos you can flip through together. `data-w`/`data-h` are the size of the `-1600.webp` file (see `assets/photos/manifest.json`).

**School photos:** the school tile is a list (`<ul class="school-roll">`). Copy the first `<li class="print print--small">...</li>`, change the photo, and delete one of the dashed empty `<li class="slot">` placeholders.

**After hours photos:** use `class="lb film film--night"` so they get the dark, blurry, grainy look.

## Deploy on Netlify

1. Push this folder to GitHub (see "Own repository" below).
2. On Netlify: **Add new site, Import an existing project**, pick the repo.
3. Build command: leave empty. Publish directory: `.`
   (If the site lives in a subfolder of a bigger repo, set **Base directory** to `maxi-website` instead.)
4. Deploy. `netlify.toml` already sets caching and a few security headers.

After the first deploy, change `og:image` and `twitter:image` in `index.html` to the full URL (for example `https://your-site.netlify.app/og-image.jpg`) so LinkedIn and Instagram show the preview picture.

### Own repository

This site was built inside the folder `maxi-website/`. To give it its own private GitHub repository:

```bash
cp -r maxi-website ~/maxi-website && cd ~/maxi-website
git init -b main
git add . && git commit -m "Maxi's website, first version"
gh repo create maxi-website --private --source=. --remote=origin --push
```

## Privacy and legal

- No analytics, no cookies, no third-party scripts, no external fonts or CDNs. So no cookie banner is needed.
- No email, phone number or address anywhere on the site. Location is never more precise than "Schleswig, Germany".
- **Search engines:** the site is hidden from search for now. To make it findable later, remove the line `<meta name="robots" content="noindex, nofollow">` from `index.html` **and** the `X-Robots-Tag` line from `netlify.toml`.
- **Impressum:** a website run from Germany may need an Impressum (legal notice) depending on how it is used. Check this with your parents before making the site public. No legal page has been added on purpose.

## Still to fill in

- `<!-- TODO Maxi: add favorite dishes -->` in the food tile (three lines, then delete "Menu coming soon.").
- Travel place names come from memory in the photo README and may need correcting (captions + stamps in the travel tile).
- Absolute `og:image` URL once the site has its address.
- More school photos, food photos and photos of you, when you have them.
