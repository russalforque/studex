import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("title");

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 18, mass: 0.9 } });
  return (
    <Stage dark duration={duration}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: -120,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgb(58 168 255 / 0.55), rgb(58 168 255 / 0) 65%)",
              opacity: interpolate(frame, [0, 20, 60], [0, 1, 0.6], { extrapolateRight: "clamp" }),
            }}
          />
          <Img
            src={staticFile("logo.png")}
            style={{
              position: "relative",
              width: 200,
              height: 200,
              borderRadius: 46,
              scale: String(interpolate(pop, [0, 1], [0.82, 1])),
              opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }),
              filter: `blur(${interpolate(frame, [0, 14], [14, 0], { extrapolateRight: "clamp" })}px)`,
            }}
          />
        </div>
        <Words text="Studex" start={8} style={{ marginTop: 56, fontSize: 168, fontWeight: 800, letterSpacing: -7 }} />
        <Words
          text="Everything you juggle. One calm app."
          start={30}
          stagger={2}
          style={{ marginTop: 10, fontSize: 44, fontWeight: 500, color: "#b9c4de" }}
        />
      </div>
    </Stage>
  );
};
