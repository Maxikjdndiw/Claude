#!/usr/bin/env python3
"""
Generate responsive photo sizes for the website.

Reads every JPEG in assets/photos-source/ and writes into assets/photos/:
  <name>-480.webp    thumbnail WebP (small tiles on phones)
  <name>-800.webp    medium WebP (phones, small tiles)
  <name>-1600.webp   large WebP (big tiles, lightbox, retina)
  <name>-800.jpg     JPEG fallback for very old browsers

Also writes:
  assets/photos/manifest.json   real pixel sizes of every generated file
  og-image.jpg                  1200x630 social preview cut from the hero photo

Usage (from the project root):
  pip install Pillow
  python3 tools/make-sizes.py                 # (re)generate everything
  python3 tools/make-sizes.py --snippet img_7310 "Short alt text"
                                              # print a ready to paste <picture> tag

Existing files are skipped unless the source is newer (delete assets/photos/*
to force a rebuild), so it is safe to run
again after adding photos. Metadata (EXIF, GPS) is never copied.
"""
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter, ImageOps
except ImportError:
    sys.exit("Pillow is missing. Run: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "photos-source"
OUT = ROOT / "assets" / "photos"
WIDTHS = (480, 800, 1600)
QUALITY = {480: 70, 800: 70, 1600: 66}
FALLBACK_WIDTH = 800
HERO = "img_7707"
OG_SIZE = (1200, 630)


def load(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    return im.convert("RGB")


def resized(im, width):
    if im.width > width:
        height = round(im.height * width / im.width)
        im = im.resize((width, height), Image.LANCZOS)
    # A light median filter removes sensor noise. The site adds its own film
    # grain in CSS, so this keeps files about half the size without looking soft.
    return im.filter(ImageFilter.MedianFilter(3))


def needs_update(src, dst):
    return not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    sources = sorted(SRC.glob("*.jpg")) + sorted(SRC.glob("*.jpeg"))
    if not sources:
        sys.exit(f"No JPEGs found in {SRC}")

    for src in sources:
        name = src.stem
        im = load(src)
        entry = {"width": im.width, "height": im.height, "webp": {}, "jpg": None}

        for w in WIDTHS:
            dst = OUT / f"{name}-{w}.webp"
            small = resized(im, w)
            if needs_update(src, dst):
                small.save(dst, "WEBP", quality=QUALITY[w], method=6)
            entry["webp"][w] = [small.width, small.height]

        dst = OUT / f"{name}-{FALLBACK_WIDTH}.jpg"
        small = resized(im, FALLBACK_WIDTH)
        if needs_update(src, dst):
            small.save(dst, "JPEG", quality=76, optimize=True, progressive=True)
        entry["jpg"] = [small.width, small.height]

        manifest[name] = entry
        print(f"  {name:22s} {im.width}x{im.height}")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    make_og()
    print(f"Done: {len(manifest)} photos in {OUT.relative_to(ROOT)}")


def make_og():
    src = SRC / f"{HERO}.jpg"
    if not src.exists():
        return
    im = load(src)
    tw, th = OG_SIZE
    # Crop a wide band from the portrait hero, a little above centre so the
    # walking figure and the building stay in frame.
    scale = tw / im.width
    im = im.resize((tw, round(im.height * scale)), Image.LANCZOS)
    top = max(0, min(im.height - th, round(im.height * 0.36) - th // 2))
    im = im.crop((0, top, tw, top + th))
    # Warm, slightly faded tone so the preview matches the site.
    sepia = ImageOps.colorize(ImageOps.grayscale(im), "#2a2018", "#f4e6cc")
    im = Image.blend(im, sepia, 0.22)
    im.save(ROOT / "og-image.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print("  og-image.jpg 1200x630")


def snippet(name, alt):
    manifest = json.loads((OUT / "manifest.json").read_text())
    e = manifest[name]
    w = e["webp"]
    print(f"""<picture>
  <source type="image/webp"
          srcset="assets/photos/{name}-480.webp {w['480'][0]}w, assets/photos/{name}-800.webp {w['800'][0]}w, assets/photos/{name}-1600.webp {w['1600'][0]}w"
          sizes="(min-width: 1100px) 25vw, (min-width: 700px) 45vw, 90vw">
  <img src="assets/photos/{name}-800.jpg" width="{e['jpg'][0]}" height="{e['jpg'][1]}"
       alt="{alt}" loading="lazy" decoding="async">
</picture>""")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--snippet":
        if len(sys.argv) < 3:
            sys.exit('Usage: make-sizes.py --snippet <name> "alt text"')
        snippet(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
    else:
        build()
