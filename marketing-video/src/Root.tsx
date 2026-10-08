import { Composition, Folder } from "remotion";
import { StudexPromo, VoicedScene } from "./StudexPromo";
import { TIMELINE } from "./timeline";
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
  </>
);
