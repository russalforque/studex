import { useCurrentFrame } from "remotion";
import { Device, HEADLINE, Kicker, Stage, useEnter, useTall, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("plan");

export const Plan: React.FC = () => {
  const frame = useCurrentFrame();
  const tall = useTall();
  const a = useEnter(6, 40);
  const b = useEnter(16, 40);
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", top: tall ? 220 : 96, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Kicker start={2}>Schedule & tasks</Kicker>
        <Words text={tall ? "Classes and\ndeadlines, handled." : "Classes and deadlines, handled."} start={6} style={{ ...HEADLINE, fontSize: tall ? 100 : 84, marginTop: 22 }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: tall ? 60 : 540,
          top: tall ? 720 : 380,
          opacity: a,
          transform: `perspective(2400px) translateY(${(1 - a) * 200 - frame * 0.12}px) rotateY(12deg) rotateZ(-2deg)`,
        }}
      >
        <Device screen="schedule" width={tall ? 460 : 390} />
      </div>
      <div
        style={{
          position: "absolute",
          left: tall ? 560 : 990,
          top: tall ? 690 : 360,
          opacity: b,
          transform: `perspective(2400px) translateY(${(1 - b) * 200 - frame * 0.2}px) rotateY(-12deg) rotateZ(2deg)`,
        }}
      >
        <Device screen="tasks" width={tall ? 460 : 390} />
      </div>
    </Stage>
  );
};
