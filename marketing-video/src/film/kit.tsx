import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FONT } from "../theme";
import { TIMELINE } from "./timeline";

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const F = {
  brand: "#1463ff",
  brandSoft: "#3aa8ff",
  navy: "#05070f",
  ink: "#0b0b0f",
  ink2: "#55555f",
  light: "#f4f5f9",
};

/** 0 → 1 from `start` over `dur` frames. */
export const useEnter = (start: number, dur = 24) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing: EASE });
};

// Screens -------------------------------------------------------------------------------------
// Real app screenshots from scripts/capture-screens.mjs (393×852 CSS px at 3×).
export type Screen = "home" | "schedule" | "tasks" | "exams" | "subject" | "grades" | "budget" | "savings" | "goal" | "week" | "focus" | "notes";
const SCREEN_W = 393;
const SCREEN_H = 852;
const STATUS_H = 50;

/** Cards cut from the screenshots, in CSS px: [left, top, right, bottom], corner radius. */
export const CARDS = {
  nextClass: { screen: "home", rect: [16, 125, 377, 297], radius: 30 },
  tasksProgress: { screen: "tasks", rect: [16, 191, 377, 308], radius: 30 },
  physicsQuiz: { screen: "exams", rect: [16, 151, 377, 417], radius: 30 },
  gradeEstimate: { screen: "subject", rect: [16, 321, 377, 542], radius: 26 },
  budgetLeft: { screen: "budget", rect: [16, 77, 377, 285], radius: 30 },
  safeToday: { screen: "budget", rect: [16, 297, 192, 385], radius: 24 },
  laptopGoal: { screen: "savings", rect: [16, 311, 377, 464], radius: 26 },
} as const satisfies Record<string, { screen: Screen; rect: readonly [number, number, number, number]; radius: number }>;

const shot = (s: Screen) => staticFile(`screens/${s}.png`);

const StatusBar: React.FC<{ k: number }> = ({ k }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      height: STATUS_H * k,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `0 ${30 * k}px 0 ${44 * k}px`,
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: 16 * k,
      color: "#111",
    }}
  >
    <span>8:50</span>
    <svg width={68 * k} height={13 * k} viewBox="0 0 68 13" fill="#111">
      {[3, 5.5, 8, 10.5].map((h, i) => (
        <rect key={i} x={i * 4.5} y={12 - h} width={3} height={h} rx={0.8} />
      ))}
      <path d="M30 4.2a9 9 0 0 1 12 0l-1.3 1.4a7 7 0 0 0-9.4 0zM32.6 7a5 5 0 0 1 6.8 0L36 10.6z" />
      <rect x={45.5} y={1} width={19} height={10.5} rx={3} fill="none" stroke="#111" strokeOpacity={0.45} />
      <rect x={47.2} y={2.7} width={14} height={7.1} rx={1.6} />
      <rect x={65.6} y={4.3} width={1.6} height={4} rx={0.8} fillOpacity={0.45} />
    </svg>
  </div>
);

/** A modern phone showing a real Studex screen. `width` is the outer width in px. */
export const Device: React.FC<{ screen: Screen; width: number; style?: React.CSSProperties }> = ({ screen, width, style }) => {
  const rim = width * 0.008;
  const bezel = width * 0.035;
  const sw = width - 2 * (rim + bezel);
  const k = sw / SCREEN_W;
  const sh = (SCREEN_H + STATUS_H) * k;
  const outerR = width * 0.165;
  return (
    <div style={{ position: "relative", width, height: sh + 2 * (rim + bezel), ...style }}>
      {/* Side buttons */}
      {[
        { left: -width * 0.012, top: width * 0.42, height: width * 0.14 },
        { left: -width * 0.012, top: width * 0.6, height: width * 0.14 },
        { right: -width * 0.012, top: width * 0.5, height: width * 0.22 },
      ].map((b, i) => (
        <div key={i} style={{ position: "absolute", width: width * 0.014, borderRadius: 4, background: "linear-gradient(90deg,#3a3a3e,#8a8a90,#3a3a3e)", ...b }} />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: outerR,
          padding: rim,
          background: "linear-gradient(135deg,#9a9aa0 0%,#3b3b40 30%,#6d6d73 60%,#2a2a2e 100%)",
          boxShadow: `0 ${width * 0.12}px ${width * 0.3}px -${width * 0.06}px rgb(8 12 30 / 0.45), 0 ${width * 0.02}px ${width * 0.05}px rgb(8 12 30 / 0.2)`,
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: outerR - rim, background: "#050506", padding: bezel }}>
          <div style={{ position: "relative", width: sw, height: sh, borderRadius: outerR - rim - bezel, overflow: "hidden", background: "#f2f2f4" }}>
            <Img src={shot(screen)} style={{ position: "absolute", left: 0, top: STATUS_H * k, width: sw, height: SCREEN_H * k }} />
            <StatusBar k={k} />
            <div
              style={{
                position: "absolute",
                top: 11 * k,
                left: "50%",
                translate: "-50% 0",
                width: 122 * k,
                height: 36 * k,
                borderRadius: 999,
                background: "#000",
              }}
            />
            {/* Glass sheen */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0) 32%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
};

/** A card lifted out of a screenshot, shown `width` px wide. */
export const Callout: React.FC<{ card: keyof typeof CARDS; width: number; style?: React.CSSProperties }> = ({ card, width, style }) => {
  const { screen, rect, radius } = CARDS[card];
  const [x0, y0, x1, y1] = rect;
  const k = width / (x1 - x0);
  return (
    <div
      style={{
        position: "relative",
        width,
        height: (y1 - y0) * k,
        borderRadius: radius * k,
        overflow: "hidden",
        boxShadow: `0 ${30 * k}px ${70 * k}px -${20 * k}px rgb(8 12 30 / 0.35), 0 ${4 * k}px ${12 * k}px rgb(8 12 30 / 0.08)`,
        ...style,
      }}
    >
      <Img src={shot(screen)} style={{ position: "absolute", left: -x0 * k, top: -y0 * k, width: SCREEN_W * k, height: SCREEN_H * k }} />
    </div>
  );
};

// Type ----------------------------------------------------------------------------------------
/** Words rise in one after another, sharpening from a blur. */
export const Words: React.FC<{ text: string; start: number; stagger?: number; style?: React.CSSProperties }> = ({
  text,
  start,
  stagger = 3,
  style,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={style}>
      {text.split("\n").map((line, li, lines) => (
        <div key={li}>
          {line.split(" ").map((word, wi) => {
            const index = lines.slice(0, li).reduce((n, l) => n + l.split(" ").length, 0) + wi;
            const p = interpolate(frame, [start + index * stagger, start + index * stagger + 22], [0, 1], { ...clamp, easing: EASE });
            return (
              <span
                key={wi}
                style={{
                  display: "inline-block",
                  marginRight: "0.25em",
                  opacity: p,
                  translate: `0px ${(1 - p) * 0.45}em`,
                  filter: `blur(${(1 - p) * 10}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const Fade: React.FC<{ start: number; dur?: number; y?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  start,
  dur = 24,
  y = 24,
  style,
  children,
}) => {
  const p = useEnter(start, dur);
  return <div style={{ opacity: p, translate: `0px ${(1 - p) * y}px`, filter: `blur(${(1 - p) * 8}px)`, ...style }}>{children}</div>;
};

export const Kicker: React.FC<{ start: number; children: React.ReactNode; dark?: boolean }> = ({ start, children, dark }) => (
  <Fade start={start}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase", color: dark ? F.brandSoft : F.brand }}>
      <div style={{ width: 36, height: 3, borderRadius: 2, background: "currentColor" }} />
      {children}
    </div>
  </Fade>
);

export const HEADLINE: React.CSSProperties = { fontSize: 92, fontWeight: 800, letterSpacing: -3.5, lineHeight: 1.02 };
export const SUB: React.CSSProperties = { fontSize: 34, fontWeight: 500, lineHeight: 1.4, color: F.ink2 };

// Stage ---------------------------------------------------------------------------------------
/** Scene backdrop with a slow camera push-in and drifting light. */
export const Stage: React.FC<{ dark?: boolean; duration: number; children: React.ReactNode }> = ({ dark, duration, children }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, duration], [0, 1]);
  return (
    <AbsoluteFill style={{ background: dark ? F.navy : F.light, fontFamily: FONT, color: dark ? "#fff" : F.ink, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: 900 - drift * 160,
          top: -620 + drift * 60,
          borderRadius: "50%",
          background: dark
            ? "radial-gradient(circle, rgb(20 99 255 / 0.38) 0%, rgb(20 99 255 / 0) 62%)"
            : "radial-gradient(circle, rgb(58 168 255 / 0.20) 0%, rgb(58 168 255 / 0) 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          left: -500 + drift * 140,
          top: 300 - drift * 40,
          borderRadius: "50%",
          background: dark
            ? "radial-gradient(circle, rgb(90 77 211 / 0.25) 0%, rgb(90 77 211 / 0) 62%)"
            : "radial-gradient(circle, rgb(229 225 251 / 0.9) 0%, rgb(229 225 251 / 0) 62%)",
        }}
      />
      {/* Content clears out before the cut, so scenes never double-expose during the fade. */}
      <AbsoluteFill
        style={{
          scale: String(interpolate(frame, [0, duration], [1, 1.035])),
          opacity: interpolate(frame, [duration - TIMELINE.transition, duration - 4], [1, 0], clamp),
          filter: `blur(${interpolate(frame, [duration - TIMELINE.transition, duration - 4], [0, 12], clamp)}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Fine film grain and a soft vignette over the whole film. */
export const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.07, mixBlendMode: "overlay" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 12} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgb(0 0 0 / 0) 60%, rgb(0 0 10 / 0.18) 100%)" }} />
    </AbsoluteFill>
  );
};
