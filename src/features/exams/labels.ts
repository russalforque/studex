import type { ExamKind, StudyStatus } from '@/types/models'

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  exam: 'Exam',
  quiz: 'Quiz',
  presentation: 'Presentation',
  project: 'Project',
}

export const STUDY_LABEL: Record<StudyStatus, string> = {
  not_started: 'Not started',
  studying: 'Studying',
  ready: 'Ready',
  completed: 'Done',
}

export const STUDY_TONE: Record<StudyStatus, 'neutral' | 'accent' | 'ok' | 'warn'> = {
  not_started: 'neutral',
  studying: 'accent',
  ready: 'ok',
  completed: 'neutral',
}
