import { FloatingDevice, PopCard, Stage, TextBlock, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("today");

export const Today: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Today"
        title={"Your day,\nat a glance."}
        sub="Your next class, what's due, and what you can spend, the moment you open Studex."
        wide={{ left: 150, top: 300, width: 720 }}
        subWidth={660}
      />
      {tall ? (
        <>
          <FloatingDevice screen="home" width={470} left={305} top={830} turn={-8} settle={3} />
          <PopCard card="nextClass" at={58} width={520} left={60} top={930} />
          <PopCard card="tasksProgress" at={96} width={450} left={570} top={1320} />
        </>
      ) : (
        <>
          <FloatingDevice screen="home" width={420} left={1170} top={90} />
          <PopCard card="nextClass" at={58} width={470} left={930} top={330} />
          <PopCard card="tasksProgress" at={96} width={410} left={1440} top={690} />
        </>
      )}
    </Stage>
  );
};
