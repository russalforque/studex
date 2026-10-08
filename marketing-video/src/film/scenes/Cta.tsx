import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Fade, Stage, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("cta");

export const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 18 } });
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 150,
            height: 150,
            borderRadius: 36,
            boxShadow: "0 30px 70px -24px rgb(20 99 255 / 0.55)",
            scale: String(interpolate(pop, [0, 1], [0.85, 1])),
            opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }),
          }}
        />
        <Words text="Studex" start={6} style={{ marginTop: 40, fontSize: 150, fontWeight: 800, letterSpacing: -6 }} />
        <Words text="Pay once. Keep it for life." start={28} stagger={3} style={{ marginTop: 4, fontSize: 52, fontWeight: 600, color: F.ink2 }} />
        <Fade start={72}>
          <div style={{ display: "flex", gap: 20, marginTop: 56, alignItems: "center" }}>
            <div style={{ padding: "26px 52px", borderRadius: 999, background: F.ink, color: "#fff", fontSize: 38, fontWeight: 800 }}>
              Get it at studex.ph
            </div>
            <div style={{ padding: "24px 44px", borderRadius: 999, border: `2px solid ${F.ink}`, fontSize: 38, fontWeight: 800 }}>
              ₱199 one-time
            </div>
          </div>
        </Fade>
        <Fade start={92}>
          <div style={{ marginTop: 36, fontSize: 28, fontWeight: 600, color: F.ink2, letterSpacing: 0.5 }}>
            For Android · No subscription · Works offline
          </div>
        </Fade>
      </div>
    </Stage>
  );
};
