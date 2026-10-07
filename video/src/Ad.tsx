import React from "react";
import { Audio, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { SCENES, TRANSITION } from "./brand";
import { Captions, type Caption } from "./Captions";
import { BarriersCard, ChapterCard, EndCard, StatementCard } from "./scenes/Cards";
import { CartridgeScene, InsertScene } from "./scenes/Product";
import { AppShot } from "./scenes/AppShot";

/** Scene order. Durations live in brand.ts so retiming is a one-line edit. */
export const ORDER = [
  "statement",
  "barriers",
  "insert",
  "cartridge",
  "reader",
  "chapter",
  "vision",
  "result",
  "care",
  "population",
  "end",
] as const;

export const TOTAL_FRAMES = ORDER.reduce((sum, k) => sum + SCENES[k], 0) - (ORDER.length - 1) * TRANSITION;

/** Frame each scene starts on, accounting for the overlap of every dissolve. */
export const sceneStarts = (): Record<(typeof ORDER)[number], number> => {
  let at = 0;
  const out = {} as Record<(typeof ORDER)[number], number>;
  for (const key of ORDER) {
    out[key] = at;
    at += SCENES[key] - TRANSITION;
  }
  return out;
};

/** The approved voiceover, timed to the recorded read (frames @30fps). */
export const voiceover = (): Caption[] => [
  { from: 10, durationInFrames: 111, text: "We know screening matters. But life doesn’t always make room for it." },
  { from: 135, durationInFrames: 169, text: "For many women, screening can mean time, travel, cost, and another medical procedure." },
  { from: 316, durationInFrames: 92, text: "So KAIA starts with something already part of her life." },
  { from: 426, durationInFrames: 148, text: "During menstruation, KAIA collects a sample naturally — through a simple pad insert." },
  { from: 584, durationInFrames: 77, text: "The sample is screened for cervical-health markers," },
  { from: 894, durationInFrames: 128, text: "while KAIA helps interpret the result, and explain what happens next." },
  { from: 1104, durationInFrames: 177, text: "And if follow-up is needed, KAIA connects her to care — and stays with her until the pathway is completed." },
  { from: 1287, durationInFrames: 79, text: "Because screening only works when women can reach it." },
  // the end card speaks for itself — no caption over the logo
];

export type AdProps = {
  captions: boolean;
  /** Scratch score generated for this cut — swap for a licensed track. */
  musicSrc: string | null;
  /** Scratch voiceover — replace with the recorded read. */
  voSrc: string | null;
};

const dissolve = (
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
);

export const Ad: React.FC<AdProps> = ({ captions, musicSrc, voSrc }) => (
  <>
    {musicSrc ? <Audio src={staticFile(musicSrc)} /> : null}
    {voSrc ? <Audio src={staticFile(voSrc)} /> : null}
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES.statement}>
        <StatementCard title="We know screening matters." sub="But life doesn’t always make room for it." />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.barriers}>
        <BarriersCard title="For many women, screening means…" items={["Time", "Travel", "Cost", "Another procedure"]} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.insert}>
        <InsertScene
          title="So KAIA starts with something already part of her life."
          sub="A discreet insert on the pad she already uses."
        />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.cartridge}>
        <CartridgeScene
          title="During menstruation, KAIA collects a sample naturally."
          items={["No swab", "No blood draw", "Passive collection"]}
        />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.reader}>
        <AppShot clip="reader.mp4" durationInFrames={SCENES.reader} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.chapter}>
        <ChapterCard
          eyebrow="The science"
          title="Screened for cervical-health markers."
          note="KAIA is a screening platform, not a cancer diagnosis."
        />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.vision}>
        <AppShot clip="vision.mp4" durationInFrames={SCENES.vision} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.result}>
        <AppShot clip="result.mp4" durationInFrames={SCENES.result} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.care}>
        <AppShot clip="care.mp4" durationInFrames={SCENES.care} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.population}>
        <AppShot clip="population.mp4" durationInFrames={SCENES.population} />
      </TransitionSeries.Sequence>
      {dissolve}
      <TransitionSeries.Sequence durationInFrames={SCENES.end}>
        <EndCard fine="Because screening only works when women can reach it." />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {captions ? <Captions captions={voiceover()} /> : null}
  </>
);
