import { useCurrentFrame } from "remotion";
import { Callout, Device, Fade, HEADLINE, Kicker, Stage, SUB, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("savings");

export const Savings: React.FC = () => {
  const frame = useCurrentFrame();
  const back = useEnter(8, 40);
  const front = useEnter(0, 40);
  const card = useEnter(36, 26);
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", left: 150, top: 300, width: 720 }}>
        <Kicker start={4}>Savings goals</Kicker>
        <Words text={"Save for what\nmatters."} start={8} style={{ ...HEADLINE, marginTop: 26 }} />
        <Fade start={26}>
          <div style={{ ...SUB, marginTop: 30, maxWidth: 580 }}>Track every goal, and see the monthly pace that gets you there on time.</div>
        </Fade>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1400,
          top: 150,
          opacity: back,
          transform: `perspective(2400px) translateY(${(1 - back) * 160 - frame * 0.15}px) rotateY(-20deg)`,
          filter: "brightness(0.96)",
        }}
      >
        <Device screen="savings" width={360} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1080,
          top: 90,
          opacity: front,
          transform: `perspective(2400px) translateY(${(1 - front) * 140}px) rotateY(${-12 + front * 4}deg) rotateX(3deg)`,
        }}
      >
        <Device screen="goal" width={420} />
      </div>
      <Callout
        card="laptopGoal"
        width={450}
        style={{ position: "absolute", left: 880, top: 620 - card * 30, opacity: card, scale: String(0.92 + card * 0.08), filter: `blur(${(1 - card) * 8}px)` }}
      />
    </Stage>
  );
};
