import { FloatingDevice, PopCard, Stage, TextBlock, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("savings");

export const Savings: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Savings goals"
        title={"Save for what\nmatters."}
        sub="Track every goal, and see the monthly pace that gets you there on time."
        wide={{ left: 150, top: 300, width: 720 }}
        subWidth={580}
      />
      {tall ? (
        <>
          <FloatingDevice screen="savings" width={400} left={600} top={900} at={8} turn={-20} settle={0} lift={0.15} style={{ filter: "brightness(0.96)" }} />
          <FloatingDevice screen="goal" width={470} left={190} top={830} turn={-10} settle={4} />
          <PopCard card="laptopGoal" at={36} width={500} left={60} top={1340} />
        </>
      ) : (
        <>
          <FloatingDevice screen="savings" width={360} left={1400} top={150} at={8} turn={-20} settle={0} lift={0.15} style={{ filter: "brightness(0.96)" }} />
          <FloatingDevice screen="goal" width={420} left={1080} top={90} turn={-12} settle={4} />
          <PopCard card="laptopGoal" at={36} width={450} left={880} top={620} />
        </>
      )}
    </Stage>
  );
};
