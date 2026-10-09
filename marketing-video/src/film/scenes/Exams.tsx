import { FloatingDevice, PopCard, Stage, TextBlock, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("exams");

export const Exams: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Exams & quizzes"
        title={"Study with\na plan."}
        sub="A countdown and a study checklist for every exam and quiz."
        wide={{ left: 150, top: 300, width: 720 }}
        subWidth={600}
      />
      {tall ? (
        <>
          <FloatingDevice screen="exams" width={470} left={305} top={830} turn={-8} settle={3} />
          <PopCard card="physicsQuiz" at={40} width={500} left={60} top={980} />
        </>
      ) : (
        <>
          <FloatingDevice screen="exams" width={420} left={1170} top={90} />
          <PopCard card="physicsQuiz" at={40} width={450} left={930} top={300} />
        </>
      )}
    </Stage>
  );
};
