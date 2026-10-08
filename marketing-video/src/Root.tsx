import { Composition, Folder } from "remotion";
import { StudexPromo, VoicedScene } from "./StudexPromo";
import { TIMELINE } from "./timeline";
import { FilmScene, StudexFilm } from "./film/StudexFilm";
import { TIMELINE as FILM } from "./film/timeline";
import "./theme";

// Vertical 9:16 for Reels, TikTok, Stories and Shorts. Lengths come from the voiceover timeline.
const SIZE = { width: 1080, height: 1920, fps: TIMELINE.fps } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="StudexPromo" component={StudexPromo} durationInFrames={TIMELINE.total} {...SIZE} />
    <Folder name="Scenes">
      {TIMELINE.scenes.map((s) => (
        <Composition
          key={s.id}
          id={s.id[0].toUpperCase() + s.id.slice(1)}
          component={VoicedScene}
          defaultProps={{ id: s.id }}
          durationInFrames={s.duration}
          {...SIZE}
        />
      ))}
    </Folder>
    {/* 16:9 product film with real app screens, for YouTube, the website and presentations. */}
    <Composition id="StudexFilm" component={StudexFilm} durationInFrames={FILM.total} width={1920} height={1080} fps={FILM.fps} />
    <Folder name="Film-scenes">
      {FILM.scenes.map((s) => (
        <Composition
          key={s.id}
          id={`Film-${s.id}`}
          component={FilmScene}
          defaultProps={{ id: s.id }}
          durationInFrames={s.duration}
          width={1920}
          height={1080}
          fps={FILM.fps}
        />
      ))}
    </Folder>
  </>
);
