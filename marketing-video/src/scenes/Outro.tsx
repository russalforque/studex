import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { DOWNLOAD_URL } from "../links";
import { C } from "../theme";
import { Rise, Scene } from "../ui";

const CHIPS = [
  { text: "Free to start", bg: C.mint },
  { text: "Upgrade anytime", bg: C.sky },
  { text: "Works offline", bg: C.pink },
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const pulse = 1 + Math.max(0, Math.sin((frame - 130) / 6)) * 0.03 * (frame > 130 ? 1 : 0);
  return (
    <Scene>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 90px",
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 260,
            height: 260,
            borderRadius: 64,
            boxShadow: "0 40px 90px -30px rgb(20 99 255 / 0.45)",
            scale: String(interpolate(pop, [0, 1], [0.5, 1])),
          }}
        />
        <Rise start={8}>
          <div style={{ marginTop: 50, fontSize: 132, fontWeight: 800, letterSpacing: -5 }}>Studex</div>
        </Rise>
        <Rise start={30}>
          <div style={{ fontSize: 56, fontWeight: 600, color: C.ink2, lineHeight: 1.2 }}>
            Free to download.
          </div>
        </Rise>
        <Rise start={70}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, marginTop: 50 }}>
            {CHIPS.map((c) => (
              <div key={c.text} style={{ padding: "14px 28px", borderRadius: 999, background: c.bg, fontSize: 34, fontWeight: 700 }}>
                {c.text}
              </div>
            ))}
          </div>
        </Rise>
        <Rise start={98}>
          <div
            style={{
              marginTop: 70,
              padding: "34px 64px",
              borderRadius: 999,
              background: C.ink,
              color: "#fff",
              fontSize: 54,
              fontWeight: 800,
              scale: String(pulse),
            }}
          >
            Get Studex free
          </div>
        </Rise>
        <Rise start={114}>
          <div style={{ marginTop: 44, fontSize: 36, fontWeight: 600, color: C.ink2 }}>Get it at</div>
          <div
            style={{
              marginTop: 12,
              padding: "20px 36px",
              borderRadius: 24,
              background: "#fff",
              border: `3px solid ${C.brand}`,
              color: C.brand,
              fontSize: 50,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            {DOWNLOAD_URL}
          </div>
        </Rise>
      </div>
    </Scene>
  );
};
