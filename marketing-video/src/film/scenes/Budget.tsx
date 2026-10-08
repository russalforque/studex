import { useCurrentFrame } from "remotion";
import { Callout, Device, Fade, HEADLINE, Kicker, Stage, SUB, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("budget");

export const Budget: React.FC = () => {
  const frame = useCurrentFrame();
  const phone = useEnter(0, 40);
  const left = useEnter(36, 26);
  const safe = useEnter(70, 26);
  return (
    <Stage duration={duration}>
      <div
        style={{
          position: "absolute",
          left: 330,
          top: 90,
          opacity: phone,
          transform: `perspective(2400px) translateY(${(1 - phone) * 140}px) rotateY(${16 - phone * 6 - frame * 0.02}deg) rotateX(3deg)`,
        }}
      >
        <Device screen="budget" width={420} />
      </div>
      <Callout
        card="budgetLeft"
        width={470}
        style={{ position: "absolute", left: 600, top: 200 - left * 30, opacity: left, scale: String(0.92 + left * 0.08), filter: `blur(${(1 - left) * 8}px)` }}
      />
      <Callout
        card="safeToday"
        width={330}
        style={{ position: "absolute", left: 140, top: 620 - safe * 30, opacity: safe, scale: String(0.92 + safe * 0.08), filter: `blur(${(1 - safe) * 8}px)` }}
      />
      <div style={{ position: "absolute", left: 1150, top: 300, width: 660 }}>
        <Kicker start={4}>Allowance</Kicker>
        <Words text={"Make your\nallowance last."} start={8} style={{ ...HEADLINE, marginTop: 26 }} />
        <Fade start={26}>
          <div style={{ ...SUB, marginTop: 30, maxWidth: 600 }}>Studex works out what's safe to spend each day, and sets your savings aside first.</div>
        </Fade>
      </div>
    </Stage>
  );
};
