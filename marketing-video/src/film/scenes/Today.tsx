import { useCurrentFrame } from "remotion";
import { Callout, Device, Fade, HEADLINE, Kicker, Stage, SUB, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("today");

export const Today: React.FC = () => {
  const frame = useCurrentFrame();
  const phone = useEnter(0, 40);
  const card1 = useEnter(58, 26);
  const card2 = useEnter(96, 26);
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", left: 150, top: 300, width: 720 }}>
        <Kicker start={4}>Today</Kicker>
        <Words text={"Your day,\nat a glance."} start={8} style={{ ...HEADLINE, marginTop: 26 }} />
        <Fade start={26}>
          <div style={{ ...SUB, marginTop: 30, maxWidth: 660 }}>Your next class, what's due, and what you can spend, the moment you open Studex.</div>
        </Fade>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1170,
          top: 90,
          opacity: phone,
          transform: `perspective(2400px) translateY(${(1 - phone) * 140}px) rotateY(${-16 + phone * 6 + frame * 0.02}deg) rotateX(3deg)`,
        }}
      >
        <Device screen="home" width={420} />
      </div>
      <Callout
        card="nextClass"
        width={470}
        style={{ position: "absolute", left: 930, top: 330 - card1 * 30, opacity: card1, scale: String(0.92 + card1 * 0.08), filter: `blur(${(1 - card1) * 8}px)` }}
      />
      <Callout
        card="tasksProgress"
        width={410}
        style={{ position: "absolute", left: 1440, top: 690 - card2 * 30, opacity: card2, scale: String(0.92 + card2 * 0.08), filter: `blur(${(1 - card2) * 8}px)` }}
      />
    </Stage>
  );
};
