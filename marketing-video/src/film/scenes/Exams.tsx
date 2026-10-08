import { FloatingDevice, PopCard, Stage, TextBlock, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("exams");

export const Exams: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Exams & grades"
        title={"Study with\na plan."}
        sub="Countdowns, study topics, and a live grade estimate for every subject."
        wide={{ left: 150, top: 300, width: 720 }}
        subWidth={640}
      />
      {tall ? (
        <>
          <FloatingDevice screen="exams" width={470} left={305} top={830} turn={-8} settle={3} />
          <PopCard card="physicsQuiz" at={40} width={480} left={60} top={900} />
          <PopCard card="gradeEstimate" at={122} width={510} left={510} top={1300} />
        </>
      ) : (
        <>
          <FloatingDevice screen="exams" width={420} left={1170} top={90} />
          <PopCard card="physicsQuiz" at={40} width={430} left={940} top={230} />
          <PopCard card="gradeEstimate" at={122} width={460} left={1400} top={600} />
        </>
      )}
    </Stage>
  );
};
