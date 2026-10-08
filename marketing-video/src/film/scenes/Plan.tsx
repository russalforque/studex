import { useCurrentFrame } from "remotion";
import { Device, HEADLINE, Kicker, Stage, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("plan");

export const Plan: React.FC = () => {
  const frame = useCurrentFrame();
  const a = useEnter(6, 40);
  const b = useEnter(16, 40);
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", top: 96, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Kicker start={2}>Schedule & tasks</Kicker>
        <Words text="Classes and deadlines, handled." start={6} style={{ ...HEADLINE, fontSize: 84, marginTop: 22 }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 380,
          opacity: a,
          transform: `perspective(2400px) translateY(${(1 - a) * 200 - frame * 0.12}px) rotateY(12deg) rotateZ(-2deg)`,
        }}
      >
        <Device screen="schedule" width={390} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 990,
          top: 360,
          opacity: b,
          transform: `perspective(2400px) translateY(${(1 - b) * 200 - frame * 0.2}px) rotateY(-12deg) rotateZ(2deg)`,
        }}
      >
        <Device screen="tasks" width={390} />
      </div>
    </Stage>
  );
};
