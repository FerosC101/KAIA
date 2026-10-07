import React from "react";
import { Composition } from "remotion";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import { Ad, TOTAL_FRAMES, type AdProps } from "./Ad";
import { FPS } from "./brand";

const defaultProps: AdProps = { captions: true, musicSrc: "audio/score.m4a", voSrc: "audio/vo.m4a" };

export const Root: React.FC = () => (
  <>
    <Composition id="Ad9x16" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} />
    <Composition id="Ad1x1" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1080} defaultProps={defaultProps} />
    <Composition id="Ad16x9" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} />
  </>
);
