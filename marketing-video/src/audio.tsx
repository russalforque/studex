import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { scene, type SceneId, VOICE_SPANS } from "./timeline";

const MUSIC_FULL = 0.35;
const MUSIC_UNDER_VOICE = 0.09;

/** A scene's voiceover lines, placed where the timeline says. */
export const Voice: React.FC<{ id: SceneId }> = ({ id }) => (
  <>
    {scene(id).voice.map((clip) => (
      <Sequence key={clip.file} name={`Voice: ${clip.text}`} from={clip.from} durationInFrames={clip.frames} layout="none">
        <Audio src={staticFile(clip.file)} />
      </Sequence>
    ))}
  </>
);

/** Music volume at a frame: dips under each voice line, with short fades in and out. */
const musicVolume = (frame: number) => {
  const duck = Math.max(
    0,
    ...VOICE_SPANS.map(([start, end]) =>
      interpolate(frame, [start - 6, start, end, end + 10], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );
  return interpolate(duck, [0, 1], [MUSIC_FULL, MUSIC_UNDER_VOICE]);
};

export const Music: React.FC = () => <Audio src={staticFile("music.mp3")} volume={musicVolume} />;
