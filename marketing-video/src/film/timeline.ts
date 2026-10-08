import data from "./timeline.json";
import { makeTimeline } from "../timeline";

export type FilmSceneId = "open" | "title" | "today" | "plan" | "exams" | "budget" | "savings" | "privacy" | "cta";
export const { TIMELINE, scene, VOICE_SPANS } = makeTimeline<FilmSceneId>(data);
