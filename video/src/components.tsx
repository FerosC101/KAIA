import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, SANS, SERIF, VEIL } from "./brand";

/** Everything is sized against a 1080-wide canvas, so one component set serves 9:16, 1:1 and 16:9. */
export const useScale = () => useVideoConfig().width / 1080;

/** Restrained entrance: fade + small rise, ~600ms, no bounce. */
export const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const s = useScale();
  const t = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * 26 * s}px)`, ...style }}>{children}</div>
  );
};

export const BrandBg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: BRAND.ivory,
      backgroundImage: VEIL,
      fontFamily: SANS,
      color: BRAND.charcoal,
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const s = useScale();
  return (
    <div
      style={{
        fontSize: 28 * s,
        fontWeight: 600,
        letterSpacing: 0.26 * 28 * s,
        textTransform: "uppercase",
        color: BRAND.plum,
        opacity: 0.8,
      }}
    >
      {children}
    </div>
  );
};

export const Display: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 104 }) => {
  const s = useScale();
  return (
    <h1
      style={{
        fontFamily: SERIF,
        fontWeight: 500,
        fontSize: size * s,
        lineHeight: 1.08,
        letterSpacing: -0.015 * size * s,
        margin: 0,
        marginTop: 34 * s,
      }}
    >
      {children}
    </h1>
  );
};

export const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const s = useScale();
  return (
    <p style={{ marginTop: 40 * s, fontSize: 40 * s, lineHeight: 1.55, color: BRAND.muted, maxWidth: 820 * s }}>
      {children}
    </p>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; struck?: boolean }> = ({ children, struck }) => {
  const s = useScale();
  return (
    <span
      style={{
        fontSize: 34 * s,
        padding: `${18 * s}px ${34 * s}px`,
        borderRadius: 999,
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        color: struck ? BRAND.muted : BRAND.charcoal,
        textDecoration: struck ? "line-through" : "none",
        textDecorationColor: "rgba(138,63,74,.5)",
      }}
    >
      {children}
    </span>
  );
};

export const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const s = useScale();
  return <div style={{ padding: `0 ${110 * s}px`, width: "100%" }}>{children}</div>;
};

export const KaiaMark: React.FC<{ size?: number }> = ({ size = 150 }) => {
  const s = useScale();
  return (
    <svg viewBox="0 0 48 48" style={{ height: size * s }}>
      <path d="M23.2 43C11.6 36.6 6 25.8 7.9 13.9c11 3 16.2 12.7 15.3 29.1z" fill={BRAND.burgundy} fillOpacity={0.9} />
      <path d="M24.8 43c11.6-6.4 17.2-17.2 15.3-29.1-11 3-16.2 12.7-15.3 29.1z" fill={BRAND.lavender} />
      <path
        d="M24 43.6c-2.2-7.2-3.2-13.8-3-20 .2-4.2 1.2-7.9 3-11 1.8 3.1 2.8 6.8 3 11 .2 6.2-.8 12.8-3 20z"
        fill={BRAND.plum}
      />
      <circle cx="24" cy="8.4" r="4.4" fill={BRAND.plum} />
    </svg>
  );
};
