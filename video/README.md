# KAIA brand film (Remotion)

The advertisement as React code. Every scene is a component, every timing is a number — so the
film can be edited like the rest of the product, and re-rendered to any format.

```bash
cd video
npm install
npm run studio          # http://localhost:3000 — live preview, scrub, edit props
npm run render          # → out/kaia-ad-9x16.mp4
npm run render:square   # 1080×1080
npm run render:wide     # 1920×1080
```

## Where to change things

| You want to… | Edit |
|---|---|
| Retime a scene | `src/brand.ts` → `SCENES` (values are frames at 30fps; 30 = 1s) |
| Change transition length | `src/brand.ts` → `TRANSITION` |
| Reorder or drop scenes | `src/Ad.tsx` → `ORDER` and the `TransitionSeries` |
| Edit on-screen copy | the props passed in `src/Ad.tsx` |
| Change colours or type | `src/brand.ts` → `BRAND` (mirrors `frontend/src/index.css`) |
| Adjust an illustration | `src/scenes/Product.tsx` (insert, cartridge) |
| Adjust a card layout | `src/scenes/Cards.tsx`, `src/components.tsx` |
| Swap an app shot | replace the file in `public/clips/` |

## Captions

Burned-in voiceover captions are off by default. Turn them on in Studio (the props panel) or set
`captions: true` in `src/Root.tsx`. The caption text and timings live in `voiceover()` in
`src/Ad.tsx` and stay in sync with the scene durations automatically.

## Voiceover and music

Two stems play as separate `<Audio>` layers, set in `src/Root.tsx` (or the Studio props panel):

| Prop | File | What it is |
|---|---|---|
| `voSrc` | `public/audio/vo.m4a` | **Scratch voiceover** — macOS speech synthesis, for timing only |
| `musicSrc` | `public/audio/score.m4a` | **Scratch score** — synthesised for this cut, already ducked under the voice |

To finish properly: record a Filipino-English read against the timings in
[`../docs/AD_SCRIPT.md`](../docs/AD_SCRIPT.md), save it over `public/audio/vo.m4a`, drop a licensed
track over `public/audio/score.m4a`, and `npm run render`. Set either prop to `null` to mute that
layer. The caption cues in `src/Ad.tsx` (`voiceover()`) are frame numbers — nudge them if the new
read differs in length.

## Refreshing the app shots

`public/clips/*.mp4` are screen recordings of the live app, already framed on the brand canvas
(reader, vision, result, care, population). After a UI change, re-record them so the film matches
the product — the recording tooling drives the running app at `localhost:5174`, stages the demo
through the API, and exports one clip per shot.

## Claims discipline

Keep the line "KAIA is a screening platform, not a cancer diagnosis" in any recut. Say
*screening*, *follow-up recommended*, *clinical evaluation*, *next step* — never "you have cancer",
never "AI diagnosis", never a disease probability.

## Licence note

Remotion is free for individuals and small teams; companies above its size threshold need a paid
company licence. Check <https://remotion.dev/license> before using this commercially.
