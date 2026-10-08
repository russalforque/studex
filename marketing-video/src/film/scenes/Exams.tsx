import { useCurrentFrame } from "remotion";
import { Callout, Device, Fade, HEADLINE, Kicker, Stage, SUB, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("exams");

export const Exams: React.FC = () => {
  const frame = useCurrentFrame();
  const phone = useEnter(0, 40);
  const quiz = useEnter(40, 26);
  const grade = useEnter(122, 26);
  return (
    <Stage duration={duration}>
      <div style={{ position: "absolute", left: 150, top: 300, width: 720 }}>
        <Kicker start={4}>Exams & grades</Kicker>
        <Words text={"Study with\na plan."} start={8} style={{ ...HEADLINE, marginTop: 26 }} />
        <Fade start={26}>
          <div style={{ ...SUB, marginTop: 30, maxWidth: 640 }}>Countdowns, study topics, and a live grade estimate for every subject.</div>
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
        <Device screen="exams" width={420} />
      </div>
      <Callout
        card="physicsQuiz"
        width={430}
        style={{ position: "absolute", left: 940, top: 230 - quiz * 30, opacity: quiz, scale: String(0.92 + quiz * 0.08), filter: `blur(${(1 - quiz) * 8}px)` }}
      />
      <Callout
        card="gradeEstimate"
        width={460}
        style={{ position: "absolute", left: 1400, top: 600 - grade * 30, opacity: grade, scale: String(0.92 + grade * 0.08), filter: `blur(${(1 - grade) * 8}px)` }}
      />
    </Stage>
  );
};
