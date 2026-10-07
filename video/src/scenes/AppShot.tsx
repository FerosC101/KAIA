import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BRAND } from "../brand";

/**
 * A recorded shot of the live KAIA app, already framed on the brand canvas,
 * with a slow push-in so the product never sits static on screen.
 */
export const AppShot: React.FC<{ clip: string; durationInFrames: number; push?: number }> = ({
  clip,
  durationInFrames,
  push = 0.045,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1 + push], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.ivory, overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(`clips/${clip}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};
