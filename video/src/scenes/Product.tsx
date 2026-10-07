import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { BRAND } from "../brand";
import { BrandBg, Chip, Display, Rise, Sub, Wrap, useScale } from "../components";

/** KAIA Collect — a discreet insert on a pad she already uses. No bodily imagery. */
export const InsertScene: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => {
  const frame = useCurrentFrame();
  const s = useScale();
  const float = Math.sin(frame / 22) * 7;
  const pulse = (offset: number) => interpolate(Math.sin((frame - offset) / 14), [-1, 1], [0.35, 1]);
  return (
    <BrandBg>
      <Wrap>
        <Rise>
          <svg width={620 * s} height={560 * s} viewBox="0 0 620 560" style={{ display: "block", margin: "0 auto" }}>
            <defs>
              <linearGradient id="padg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#f3eee6" />
              </linearGradient>
            </defs>
            <rect x="150" y="70" width="320" height="430" rx="150" fill="url(#padg)" stroke="#e2d9cb" strokeWidth="3" />
            <path
              d="M150 230c-44 0-66 18-66 42s22 42 66 42zM470 230c44 0 66 18 66 42s-22 42-66 42z"
              fill="#fff"
              stroke="#e2d9cb"
              strokeWidth="3"
            />
            <g transform={`translate(0 ${float})`}>
              <rect x="246" y="168" width="128" height="236" rx="64" fill="#efe9f5" stroke={BRAND.lavender} strokeWidth="3" />
              <rect x="286" y="206" width="48" height="160" rx="24" fill={BRAND.plum} opacity={0.88} />
              <circle cx="310" cy="246" r="9" fill={BRAND.green} opacity={pulse(0)} />
              <circle cx="310" cy="286" r="9" fill={BRAND.green} opacity={pulse(10)} />
              <circle cx="310" cy="326" r="9" fill={BRAND.green} opacity={pulse(20)} />
            </g>
          </svg>
        </Rise>
        <Rise delay={8}>
          <Display size={82}>{title}</Display>
        </Rise>
        {sub && (
          <Rise delay={14}>
            <Sub>{sub}</Sub>
          </Rise>
        )}
      </Wrap>
    </BrandBg>
  );
};

/** The sealed KAIA Cartridge. */
export const CartridgeScene: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  const frame = useCurrentFrame();
  const s = useScale();
  const pulse = (offset: number) => interpolate(Math.sin((frame - offset) / 16), [-1, 1], [0.45, 1]);
  return (
    <BrandBg>
      <Wrap>
        <Rise>
          <svg width={660 * s} height={440 * s} viewBox="0 0 660 440" style={{ display: "block", margin: "0 auto" }}>
            <rect x="60" y="120" width="540" height="220" rx="46" fill={BRAND.surface} stroke="#e2d9cb" strokeWidth="3" />
            <circle cx="160" cy="230" r="46" fill="#f3eee6" stroke="#ddd3c3" strokeWidth="3" />
            <circle cx="160" cy="230" r="26" fill="#c08a92" opacity="0.5" />
            <rect x="250" y="178" width="290" height="104" rx="14" fill="#faf7f2" stroke="#ddd3c3" strokeWidth="3" />
            <rect x="286" y="196" width="16" height="68" rx="8" fill={BRAND.plum} opacity={pulse(0)} />
            <rect x="346" y="196" width="16" height="68" rx="8" fill={BRAND.plum} opacity={pulse(12) * 0.62} />
            <rect x="406" y="196" width="16" height="68" rx="8" fill={BRAND.plum} opacity={0.16} />
            <rect x="466" y="196" width="16" height="68" rx="8" fill={BRAND.plum} opacity={0.12} />
            <text x="330" y="372" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="30" fill={BRAND.muted}>
              KAIA CARTRIDGE · SEALED
            </text>
          </svg>
        </Rise>
        <Rise delay={8}>
          <Display size={82}>{title}</Display>
        </Rise>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 * s, justifyContent: "center", marginTop: 50 * s }}>
          {items.map((item, i) => (
            <Rise key={item} delay={16 + i * 6}>
              <Chip>{item}</Chip>
            </Rise>
          ))}
        </div>
      </Wrap>
    </BrandBg>
  );
};
