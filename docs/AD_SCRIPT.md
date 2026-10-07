# KAIA — 9:16 advertisement

**Master:** `kaia-ad-9x16.mp4` · 1080×1920 · 50.3s · 30fps · H.264 + AAC · −15 LUFS

Rendered from the Remotion project in [`../video`](../video). The cut is locked to the voiceover.

> **Scratch audio.** The voiceover is macOS speech synthesis and the score is synthesised for this
> cut — both are placeholders for timing. Replace `video/public/audio/vo.m4a` with a recorded
> Filipino-English read and `score.m4a` with a licensed track, then re-render.

The cut is built from the real KAIA product: brand type cards, original vector illustration of
the KAIA Collect insert and cartridge, and screen recordings of the live app in a phone frame.
No stock footage, no actors, no generated people.

## Cut sheet & voiceover timing

The voiceover below is the approved script, split to the shots in the master. Durations include a
0.45s cross-dissolve between every scene.

| In | Scene | On screen | Voiceover |
|---|---|---|---|
| 0:00 | Statement card | “We know screening matters.” | *We know screening matters. But life doesn’t always make room for it.* |
| 0:04.2 | Barriers card | Time · Travel · Cost · Another procedure | *For many women, screening can mean time, travel, cost, and another medical procedure.* |
| 0:10.2 | KAIA Collect | Insert on a pad | *So KAIA starts with something already part of her life.* |
| 0:13.9 | Cartridge | No swab · No blood draw · Passive collection | *During menstruation, KAIA collects a sample naturally — through a simple pad insert.* |
| 0:19.2 | **KAIA Reader** | RDR-003, cartridge KAIA-CAR-00921, seven stages | *The sample is screened for cervical-health markers,* |
| 0:27.3 | Science card | “KAIA is a screening platform, not a cancer diagnosis.” | — |
| 0:29.5 | KAIA Vision | Assay signals, control valid, HPV detected | *…while KAIA helps interpret the result, and explain what happens next.* |
| 0:33.3 | Result | “Follow-up recommended” | — |
| 0:36.5 | Care → referral | Next step, partner clinic, QR referral | *And if follow-up is needed, KAIA connects her to care — and stays with her until the pathway is completed.* |
| 0:42.6 | Population Health | Aggregate figures only | *Because screening only works when women can reach it.* |
| 0:45.6 | End card | KAIA · Screen earlier. Understand better. Reach care. | *KAIA. Screen earlier. Understand better. Reach care.* |

## To finish as a broadcast cut

**Voiceover.** Female Filipino-English, warm and natural, no advertising lilt. Record to the
timings above (≈95 words, ~150 wpm). Leave the reader sequence (0:20.7–0:32.7) under-narrated so
the device carries it.

**Music.** Start minimal and introspective; introduce warm piano around 0:10; soft strings from
0:21; resolve hopeful on the end card. Duck 4–6 dB under voiceover. Licence required — none is
embedded in this master.

**Human scenes (optional A-roll).** The brief opens with a woman’s morning. That footage needs a
real shoot or licensed material; it is not in this master. If you add it, keep the product beats
intact and cut the first two type cards down to ~2s each to make room:

1. *0:00–0:04* — Alarm, commute, work desk. Natural morning light, handheld, shallow depth.
2. *0:04–0:08* — Phone reminder: “Cervical screening due.” She swipes it away, already late.
3. *0:08–0:11* — Clinic schedule, long commute route, work calendar. No judgement in the framing.
4. *Later, 0:44–0:50* — She walks into the partner clinic; a health worker welcomes her.
5. *0:53–0:57* — She walks forward in warm light, then the logo resolves.

Direction: documentary-meets-brand-film, warm ivory and plum grade, no clinical blue, no fear
imagery, no hospital stock aesthetic.

## Claims discipline (non-negotiable)

- Say **screening**, **follow-up recommended**, **clinical evaluation**, **next step**.
- Never **“you have cancer”**, never **“AI diagnosis”**, never a probability of disease.
- The on-screen line “KAIA is a screening platform, not a cancer diagnosis” stays in any recut.
- Every figure shown is synthetic demo data; the population scene shows aggregates only.

## Brand reference

Warm ivory `#F8F4EE` · deep plum `#4B2848` · muted burgundy `#8A3F4A` · soft lavender `#C9B7D9` ·
muted green `#8DAE9B` · deep charcoal `#1F2937`. Playfair Display for statements, Inter for UI.
Transitions 0.45s dissolve; motion stays under 900ms with no bounce.

## Rebuilding the master

The ad is generated from the running app (`frontend` on :5174, `backend` on :8010) by the scripts
kept with the demo tooling: scenes are recorded per shot, normalised to exact durations, then
cross-dissolved with ffmpeg. Re-record after any UI change so the product shots stay current.
