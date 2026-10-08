import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Rise, Scene } from "../ui";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
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
            width: 340,
            height: 340,
            borderRadius: 84,
            boxShadow: "0 40px 90px -30px rgb(20 99 255 / 0.45)",
            scale: String(interpolate(pop, [0, 1], [0.4, 1])),
            rotate: `${interpolate(pop, [0, 1], [-12, 0])}deg`,
            opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }),
          }}
        />
        <Rise start={12}>
          <div style={{ marginTop: 70, fontSize: 168, fontWeight: 800, letterSpacing: -6 }}>Studex</div>
        </Rise>
        <Rise start={20}>
          <div style={{ marginTop: 10, fontSize: 60, fontWeight: 600, color: C.ink2, lineHeight: 1.2 }}>
            Your student life,
            <br />
            <span style={{ color: C.ink }}>organized.</span>
          </div>
        </Rise>
      </div>
    </Scene>
  );
};
