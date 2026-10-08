import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Exams } from "./scenes/Exams";
import { Files } from "./scenes/Files";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Money } from "./scenes/Money";
import { Outro } from "./scenes/Outro";
import { Privacy } from "./scenes/Privacy";
import { Schedule } from "./scenes/Schedule";

export const TRANSITION = 15;

export const StudexPromo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Hook" durationInFrames={95}>
      <Hook />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Intro" durationInFrames={80}>
      <Intro />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Schedule" durationInFrames={120}>
      <Schedule />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Exams" durationInFrames={110}>
      <Exams />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Money" durationInFrames={125}>
      <Money />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Files" durationInFrames={105}>
      <Files />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Privacy" durationInFrames={100}>
      <Privacy />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
    <TransitionSeries.Sequence name="Outro" durationInFrames={120}>
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
