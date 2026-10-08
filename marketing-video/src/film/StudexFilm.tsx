import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { makeAudio } from "../audio";
import { Finish } from "./kit";
import { Budget } from "./scenes/Budget";
import { Cta } from "./scenes/Cta";
import { Exams } from "./scenes/Exams";
import { Open } from "./scenes/Open";
import { Plan } from "./scenes/Plan";
import { Privacy } from "./scenes/Privacy";
import { Savings } from "./scenes/Savings";
import { Title } from "./scenes/Title";
import { Today } from "./scenes/Today";
import { type FilmSceneId, scene, TIMELINE, VOICE_SPANS } from "./timeline";

export const FILM_SCENES: Record<FilmSceneId, React.FC> = {
  open: Open,
  title: Title,
  today: Today,
  plan: Plan,
  exams: Exams,
  budget: Budget,
  savings: Savings,
  privacy: Privacy,
  cta: Cta,
};

const { Voice, Music } = makeAudio<FilmSceneId>({
  scene,
  voiceSpans: VOICE_SPANS,
  music: "music-film.mp3",
  full: 0.4,
  underVoice: 0.12,
});

/** A scene with its voiceover and finish, as used in the film and the per-scene compositions. */
export const FilmScene: React.FC<{ id: FilmSceneId }> = ({ id }) => {
  const Scene = FILM_SCENES[id];
  return (
    <>
      <Scene />
      <Voice id={id} />
    </>
  );
};

export const StudexFilm: React.FC = () => (
  <AbsoluteFill style={{ background: "#05070f" }}>
    <TransitionSeries>
      {TIMELINE.scenes.flatMap((s, i) => {
        const sequence = (
          <TransitionSeries.Sequence key={s.id} name={s.id} durationInFrames={s.duration}>
            <FilmScene id={s.id} />
          </TransitionSeries.Sequence>
        );
        if (i === 0) return [sequence];
        return [
          <TransitionSeries.Transition key={`${s.id}-in`} presentation={fade()} timing={linearTiming({ durationInFrames: TIMELINE.transition })} />,
          sequence,
        ];
      })}
    </TransitionSeries>
    <Finish />
    <Music />
  </AbsoluteFill>
);
