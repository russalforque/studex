import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";
import { scene, type SceneId, type SceneTiming, VOICE_SPANS } from "./timeline";

/** Voice and ducked music components for one video's timeline. */
export const makeAudio = <Id extends string>(opts: {
  scene: (id: Id) => SceneTiming<Id>;
  voiceSpans: ReadonlyArray<readonly [number, number]>;
  music: string;
  full: number;
  underVoice: number;
}) => {
  /** A scene's voiceover lines, placed where the timeline says. */
  const Voice: React.FC<{ id: Id }> = ({ id }) => (
    <>
      {opts.scene(id).voice.map((clip) => (
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
      ...opts.voiceSpans.map(([start, end]) =>
        interpolate(frame, [start - 6, start, end, end + 10], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    );
    return interpolate(duck, [0, 1], [opts.full, opts.underVoice]);
  };

  const Music: React.FC = () => <Audio src={staticFile(opts.music)} volume={musicVolume} />;
  return { Voice, Music };
};

export const { Voice, Music } = makeAudio<SceneId>({
  scene,
  voiceSpans: VOICE_SPANS,
  music: "music.mp3",
  full: 0.35,
  underVoice: 0.09,
});
