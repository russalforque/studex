import data from "./timeline.json";

// Timelines are written by scripts/voiceover.py from the voiceover lengths. Re-run it after
// changing a script.
export type VoiceClip = { file: string; text: string; from: number; frames: number };
export type SceneTiming<Id extends string> = { id: Id; start: number; duration: number; voice: VoiceClip[] };
export type Timeline<Id extends string> = { fps: number; transition: number; total: number; scenes: SceneTiming<Id>[] };

export const makeTimeline = <Id extends string>(json: unknown) => {
  const timeline = json as Timeline<Id>;
  return {
    TIMELINE: timeline,
    scene: (id: Id): SceneTiming<Id> => timeline.scenes.find((s) => s.id === id)!,
    /** Voice lines on the whole video's timeline, for ducking the music. */
    VOICE_SPANS: timeline.scenes.flatMap((s) =>
      s.voice.map((v) => [s.start + v.from, s.start + v.from + v.frames] as const),
    ),
  };
};

export type SceneId = "hook" | "intro" | "schedule" | "exams" | "money" | "files" | "privacy" | "outro";
export const { TIMELINE, scene, VOICE_SPANS } = makeTimeline<SceneId>(data);
