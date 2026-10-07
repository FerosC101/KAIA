import React from "react";
import { BRAND } from "../brand";
import { BrandBg, Chip, Display, Eyebrow, KaiaMark, Rise, Sub, Wrap, useScale } from "../components";

export const StatementCard: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <BrandBg>
    <Wrap>
      <Rise>
        <Display>{title}</Display>
      </Rise>
      {sub && (
        <Rise delay={8}>
          <Sub>{sub}</Sub>
        </Rise>
      )}
    </Wrap>
  </BrandBg>
);

export const BarriersCard: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  const s = useScale();
  return (
    <BrandBg>
      <Wrap>
        <Rise>
          <Display size={82}>{title}</Display>
        </Rise>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 * s, justifyContent: "center", marginTop: 60 * s }}>
          {items.map((item, i) => (
            <Rise key={item} delay={10 + i * 7}>
              <Chip struck>{item}</Chip>
            </Rise>
          ))}
        </div>
      </Wrap>
    </BrandBg>
  );
};

export const ChapterCard: React.FC<{ eyebrow: string; title: string; note?: string }> = ({ eyebrow, title, note }) => {
  const s = useScale();
  return (
    <BrandBg>
      <Wrap>
        <Rise>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Rise>
        <Rise delay={7}>
          <Display size={88}>{title}</Display>
        </Rise>
        {note && (
          <Rise delay={14}>
            <div
              style={{
                marginTop: 56 * s,
                fontSize: 28 * s,
                color: BRAND.muted,
                border: `1px solid ${BRAND.border}`,
                background: "rgba(255,255,255,.7)",
                borderRadius: 18 * s,
                padding: `${22 * s}px ${30 * s}px`,
                display: "inline-block",
              }}
            >
              {note}
            </div>
          </Rise>
        )}
      </Wrap>
    </BrandBg>
  );
};

export const EndCard: React.FC<{ fine: string }> = ({ fine }) => {
  const s = useScale();
  return (
    <BrandBg>
      <Wrap>
        <Rise>
          <KaiaMark />
        </Rise>
        <Rise delay={6}>
          <Display>KAIA</Display>
        </Rise>
        <Rise delay={12}>
          <div style={{ marginTop: 46 * s, fontFamily: '"Playfair Display", Georgia, serif', fontSize: 52 * s, lineHeight: 1.35, color: BRAND.plum }}>
            Screen earlier.
            <br />
            Understand better.
            <br />
            Reach care.
          </div>
        </Rise>
        <Rise delay={18}>
          <div style={{ marginTop: 52 * s, fontSize: 30 * s, color: BRAND.muted }}>{fine}</div>
        </Rise>
      </Wrap>
    </BrandBg>
  );
};
