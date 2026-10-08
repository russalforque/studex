import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { Music, Voice } from "./audio";
import { Exams } from "./scenes/Exams";
import { Files } from "./scenes/Files";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Money } from "./scenes/Money";
import { Outro } from "./scenes/Outro";
import { Privacy } from "./scenes/Privacy";
import { Schedule } from "./scenes/Schedule";
import { type SceneId, TIMELINE } from "./timeline";

export const SCENES: Record<SceneId, React.FC> = {
  hook: Hook,
  intro: Intro,
  schedule: Schedule,
  exams: Exams,
  money: Money,
  files: Files,
  privacy: Privacy,
  outro: Outro,
};

// The transition into each scene; the dark scenes fade, feature scenes slide in.
const ENTER: Partial<Record<SceneId, "fade" | "slide">> = {
  intro: "fade",
  schedule: "slide",
  exams: "slide",
  money: "slide",
  files: "slide",
  privacy: "fade",
  outro: "fade",
};

/** A scene with its voiceover, as used in the video and in the per-scene compositions. */
export const VoicedScene: React.FC<{ id: SceneId }> = ({ id }) => {
  const Scene = SCENES[id];
  return (
    <>
      <Scene />
      <Voice id={id} />
    </>
  );
};

export const StudexPromo: React.FC = () => (
  <AbsoluteFill>
    <TransitionSeries>
      {TIMELINE.scenes.flatMap((s) => {
        const enter = ENTER[s.id];
        const sequence = (
          <TransitionSeries.Sequence key={s.id} name={s.id} durationInFrames={s.duration}>
            <VoicedScene id={s.id} />
          </TransitionSeries.Sequence>
        );
        if (!enter) return [sequence];
        return [
          <TransitionSeries.Transition
            key={`${s.id}-enter`}
            presentation={enter === "fade" ? fade() : slide({ direction: "from-right" })}
            timing={linearTiming({ durationInFrames: TIMELINE.transition })}
          />,
          sequence,
        ];
      })}
    </TransitionSeries>
    <Music />
  </AbsoluteFill>
);
