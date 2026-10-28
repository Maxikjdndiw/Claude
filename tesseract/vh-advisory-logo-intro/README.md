# VH Advisory logo intro (15 s)

- `LogoIntro.mp4`: final render, 1920×1080, 30 fps, 15.0 s, H.264 + AAC stereo.
- `LogoIntro.tsrct`: editable Tesseract project (fonts and sounds packaged inside).
- `Previews/`: delivery filmstrip and the end card at 10 s.
- `Assets/`: source logos (from the VH Advisory design system), fonts and generated sounds.
- `.tesseract-work/`: build recipe, empty-canvas checkpoint, checks.

Built with Tesseract CLI 0.4.0 (`tsrct`), skill `tesseract-motion`.

## Idea

Structure, not effects: a VH Green hairline draws across white, opens into the
square, and the monogram is set inside it. The serifs land first, the V is
written downward and the H stems rise like two bars (growth, data). The mark
then settles into the wordmark lockup. The divider draws, the name is wiped in
from it, and the tagline follows. After a long, quiet hold with a 2.5 percent
push, everything fades to white.

## Timeline

| Time (s) | Picture | Sound |
| --- | --- | --- |
| 0.25–1.05 | Hairline draws across | Riser (pad fades in) |
| 1.15–1.85 | Hairline opens into the green square | Soft impact |
| 1.95–3.30 | Monogram set: V serifs, V written down, H stems rise, crossbar, top serifs | Taps on the H stems, ping at 3.25 |
| 3.30–5.40 | Hold on the mark (slow 2.7 percent breathe) | Pad |
| 5.40–6.50 | Mark moves into the lockup | Whoosh |
| 6.25–7.50 | Divider draws, "VH Advisory" wipes in from it | Soft pop |
| 7.90–8.60 | Tagline fades in | – |
| 8.60–13.90 | Hold, slow push | Pad |
| 13.90–14.70 | Fade to white (ends white at 15.0) | Downlifter, pad fades out |

## Brand sources

- Logo geometry copied 1:1 from `vh-mark.svg` / `vh-wordmark.svg` and rebuilt as
  native shape and rect layers (64-unit space, Mark group scales it).
  The lockup follows the wordmark at 3× and is optically centred on the canvas.
- Colours: `brand` #0E4D3A, `on-brand` #FFFFFF, `ink` #111614, `ink-muted` #5B635F, white surface.
- Type: Newsreader (72pt optical size, Regular) for the name, Geist Regular for the tagline,
  both from Google Fonts (OFL, licences in `Assets/Fonts/`). The static cuts were
  instanced from the variable fonts with fontTools.
- Tagline copy from the design system cover. No shadows, gradients or rounding.

## Sound

All sounds are generated locally (Tesseract's procedural sound helper, plus a quiet
D add9 sine pad made with FFmpeg). No licensed music is used. Final mix: −15.1 LUFS
integrated, −1.36 dBTP true peak (target −16 to −14 LUFS, at most −1 dBTP).

## Editing

- Change the animation: edit `.tesseract-work/build_actions.py`, then rebuild from
  `.tesseract-work/LogoIntro-empty-canvas.tsrct`, re-run `.tesseract-work/add_audio.py`
  on a checkout and commit it (see the commands in the scripts), and export.
- Or open `LogoIntro.tsrct` and apply small changes directly with `tsrct project apply`.
- Export: `tsrct export --project LogoIntro.tsrct --output LogoIntro.mp4 --encoder-backend external-ffmpeg-command --ffmpeg-path /usr/bin/ffmpeg`
