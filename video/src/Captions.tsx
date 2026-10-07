import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BRAND, SANS } from "./brand";
import { useScale } from "./components";

export type Caption = { from: number; durationInFrames: number; text: string };

/** Burned-in voiceover captions for silent autoplay. Toggle with the `captions` prop. */
export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const s = useScale();
  return (
    <>
      {captions.map((c) => (
        <Sequence key={c.from} from={c.from} durationInFrames={c.durationInFrames}>
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: `0 ${80 * s}px ${110 * s}px` }}>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 34 * s,
                lineHeight: 1.4,
                color: BRAND.charcoal,
                background: "rgba(255,253,250,.92)",
                border: `1px solid ${BRAND.border}`,
                borderRadius: 16 * s,
                padding: `${18 * s}px ${28 * s}px`,
                textAlign: "center",
                maxWidth: 900 * s,
              }}
            >
              {c.text}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </>
  );
};
