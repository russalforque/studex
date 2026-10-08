import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, SHADOW_CARD } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** 0 → 1 over `dur` frames starting at `start`, eased. */
export const useProgress = (start: number, dur = 18) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing: EASE });
};

/** Fades and lifts children in at `start`. */
export const Rise: React.FC<{
  start: number;
  dur?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ start, dur = 18, distance = 40, style, children }) => {
  const p = useProgress(start, dur);
  return (
    <div style={{ opacity: p, translate: `0px ${(1 - p) * distance}px`, ...style }}>
      {children}
    </div>
  );
};

export const Scene: React.FC<{
  background?: string;
  children: React.ReactNode;
}> = ({ background = C.bg, children }) => (
  <AbsoluteFill style={{ background, fontFamily: FONT, color: C.ink }}>
    {children}
  </AbsoluteFill>
);

/** Headline block at the top of a feature scene. */
export const Headline: React.FC<{
  kicker: string;
  kickerColor: string;
  title: string;
  sub: string;
}> = ({ kicker, kickerColor, title, sub }) => (
  <div style={{ position: "absolute", top: 130, left: 90, right: 90 }}>
    <Rise start={2}>
      <div
        style={{
          display: "inline-block",
          padding: "12px 28px",
          borderRadius: 999,
          background: kickerColor,
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </div>
    </Rise>
    <Rise start={6}>
      <div style={{ marginTop: 28, fontSize: 104, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
        {title}
      </div>
    </Rise>
    <Rise start={12}>
      <div style={{ marginTop: 22, fontSize: 46, fontWeight: 500, color: C.ink2, lineHeight: 1.25 }}>
        {sub}
      </div>
    </Rise>
  </div>
);

/** Phone frame that slides up from the bottom of the scene. */
export const Phone: React.FC<{ children: React.ReactNode; top?: number }> = ({
  children,
  top = 600,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: (1080 - 720) / 2,
        top,
        width: 720,
        height: 1500,
        borderRadius: 96,
        background: "#0c0c0e",
        padding: 16,
        boxShadow: "0 60px 120px -40px rgb(16 16 24 / 0.45)",
        translate: `0px ${interpolate(frame, [4, 4 + fps * 0.9], [700, 0], { ...clamp, easing: EASE })}px`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 82,
          overflow: "hidden",
          background: C.bg,
          padding: "96px 34px 0",
          zoom: 1.12,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 22,
            left: "50%",
            translate: "-50% 0",
            width: 170,
            height: 44,
            borderRadius: 999,
            background: "#0c0c0e",
          }}
        />
        {children}
      </div>
    </div>
  );
};

export const Card: React.FC<{
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ style, children }) => (
  <div
    style={{
      background: C.surface,
      borderRadius: 34,
      padding: 26,
      boxShadow: SHADOW_CARD,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Hero: React.FC<{
  bg: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ bg, style, children }) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      background: bg,
      borderRadius: 40,
      padding: 30,
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        right: -60,
        top: -60,
        width: 220,
        height: 220,
        borderRadius: "50%",
        background: "rgb(255 255 255 / 0.4)",
      }}
    />
    <div style={{ position: "relative" }}>{children}</div>
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = C.ink2,
}) => (
  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color }}>
    {children}
  </div>
);

export const Bar: React.FC<{ value: number; color: string; track?: string }> = ({
  value,
  color,
  track = "rgb(17 17 19 / 0.08)",
}) => (
  <div style={{ height: 16, borderRadius: 999, background: track, overflow: "hidden" }}>
    <div style={{ width: `${value * 100}%`, height: "100%", borderRadius: 999, background: color }} />
  </div>
);

export const IconCircle: React.FC<{ bg: string; size?: number; children: React.ReactNode }> = ({
  bg,
  size = 64,
  children,
}) => (
  <div
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: "50%",
      background: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </div>
);
