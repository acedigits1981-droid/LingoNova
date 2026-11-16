export type ExerciseType =
  | 'word_bank'
  | 'multiple_choice'
  | 'listening'
  | 'matching_pairs'
  | 'fill_blank'
  | 'speaking';

export interface VocabularyWord {
  id: string;
  en: string;
  fa: string;
  phoneticFa: string;
  posFa: string;
  emoji: string;
  category:
    | 'greetings'
    | 'cafe'
    | 'travel'
    | 'tech'
    | 'daily'
    | 'feelings'
    | 'business'
    | 'academic'
    | 'mastery';
  audioUrl?: string;
  exampleEn: string;
  exampleFa: string;
}

export interface BaseExercise {
  id: string;
  type: ExerciseType;
  promptFa: string;
  grammarTipFa: string;
}

export interface WordBankExercise extends BaseExercise {
  type: 'word_bank';
  sourceFa: string;
  targetEn: string[];
  acceptedAnswers?: string[];
  distractorsEn: string[];
}

export interface MultipleChoiceExercise extends BaseExercise {
  type: 'multiple_choice';
  sourceFa: string;
  optionsEn: string[];
  correctIndex: number;
}

export interface ListeningExercise extends BaseExercise {
  type: 'listening';
  audioTextEn: string;
  meaningFa: string;
  targetEn: string[];
  acceptedAnswers?: string[];
  distractorsEn: string[];
}

export interface MatchingPairItem {
  id: string;
  en: string;
  fa: string;
  phoneticFa: string;
}

export interface MatchingPairsExercise extends BaseExercise {
  type: 'matching_pairs';
  pairs: MatchingPairItem[];
}

export interface FillBlankExercise extends BaseExercise {
  type: 'fill_blank';
  sourceFa: string;
  sentenceBeforeEn: string;
  sentenceAfterEn: string;
  blankAnswerEn: string;
  optionsEn: string[];
}

export interface SpeakingExercise extends BaseExercise {
  type: 'speaking';
  sourceFa: string;
  targetPhraseEn: string;
  phoneticFa: string;
  acceptedAnswers?: string[];
}

export type Exercise =
  | WordBankExercise
  | MultipleChoiceExercise
  | ListeningExercise
  | MatchingPairsExercise
  | FillBlankExercise
  | SpeakingExercise;

export interface CurriculumUnit {
  unitId: string;
  order: number;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  titleFa: string;
  titleEn: string;
  subtitleFa: string;
  accentGradient: string;
  badgeIcon: string;
  xpReward: number;
  words: VocabularyWord[];
  exercises: Exercise[];
}

export interface WordToken {
  id: string;
  text: string;
}

export interface DailyQuest {
  id: string;
  titleFa: string;
  target: number;
  current: number;
  rewardXp: number;
}

export interface UserProgress {
  xp: number;
  streak: number;
  completedUnitIds: string[];
  masteredWordIds: string[];
  lessonsCompletedToday: number;
  perfectLessonsCount: number;
  wordsReviewedToday: number;
  dailyXpEarned?: number;
  dailyXpGoal?: number;
  dailyMilestoneDate?: string;
  dailyMilestoneCelebratedDate?: string;
  passedCheckpointIds?: string[];
}
