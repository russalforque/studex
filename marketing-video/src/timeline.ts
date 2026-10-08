import data from "./timeline.json";

// Written by scripts/voiceover.py from the voiceover lengths. Re-run it after changing the script.
export type VoiceClip = { file: string; text: string; from: number; frames: number };
export type SceneId = "hook" | "intro" | "schedule" | "exams" | "money" | "files" | "privacy" | "outro";
export type SceneTiming = { id: SceneId; start: number; duration: number; voice: VoiceClip[] };

export const TIMELINE = data as { fps: number; transition: number; total: number; scenes: SceneTiming[] };

export const scene = (id: SceneId): SceneTiming => TIMELINE.scenes.find((s) => s.id === id)!;

/** Voice lines on the whole video's timeline, for ducking the music. */
export const VOICE_SPANS = TIMELINE.scenes.flatMap((s) =>
  s.voice.map((v) => [s.start + v.from, s.start + v.from + v.frames] as const),
);
