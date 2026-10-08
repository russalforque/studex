import { FloatingDevice, PopCard, Stage, TextBlock, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("budget");

export const Budget: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      {tall ? (
        <>
          <FloatingDevice screen="budget" width={470} left={305} top={830} turn={8} settle={3} />
          <PopCard card="budgetLeft" at={36} width={520} left={500} top={900} />
          <PopCard card="safeToday" at={70} width={380} left={60} top={1340} />
        </>
      ) : (
        <>
          <FloatingDevice screen="budget" width={420} left={330} top={90} turn={16} />
          <PopCard card="budgetLeft" at={36} width={470} left={600} top={200} />
          <PopCard card="safeToday" at={70} width={330} left={140} top={620} />
        </>
      )}
      <TextBlock
        kicker="Allowance"
        title={"Make your\nallowance last."}
        sub="Studex works out what's safe to spend each day, and sets your savings aside first."
        wide={{ left: 1150, top: 300, width: 660 }}
        subWidth={600}
      />
    </Stage>
  );
};
