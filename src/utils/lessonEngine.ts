import {
  CurriculumUnit,
  Exercise,
  ListeningExercise,
  UserProgress,
  WordBankExercise,
  WordToken,
} from '../types/curriculum';

export interface ExerciseSubmission {
  selectedTokens?: string[];
  selectedChoiceIndex?: number;
  matchedPairIds?: string[];
  selectedBlankOption?: string;
  spokenTranscript?: string;
}

export interface EvaluationResult {
  isCorrect: boolean;
  correctAnswerDisplay: string;
  spokenPhrase: string;
  pronunciationScore?: number;
  matchedWords?: boolean[];
}

/**
 * Normalizes an English sentence for comparison:
 * - Lowercases
 * - Expands common contractions ("i'm" -> "i am", "you're" -> "you are", etc.) or compares both forms
 * - Strips punctuation (commas, periods, exclamation marks, question marks)
 * - Collapses extra whitespace
 */
export function normalizeSentence(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandContractions(input: string): string {
  return normalizeSentence(input)
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\byou're\b/g, 'you are')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bhe's\b/g, 'he is')
    .replace(/\bshe's\b/g, 'she is')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bi'd\b/g, 'i would');
}

export function evaluateExerciseAnswer(
  exercise: Exercise,
  submission: ExerciseSubmission
): EvaluationResult {
  switch (exercise.type) {
    case 'word_bank':
    case 'listening': {
      const userRaw = (submission.selectedTokens ?? []).join(' ');
      const normUser = normalizeSentence(userRaw);
      const expandedUser = expandContractions(userRaw);

      const targetRaw = exercise.targetEn.join(' ');
      const normTarget = normalizeSentence(targetRaw);
      const expandedTarget = expandContractions(targetRaw);

      const acceptedList = (exercise.acceptedAnswers ?? []).map(normalizeSentence);
      const acceptedExpanded = (exercise.acceptedAnswers ?? []).map(expandContractions);

      const isCorrect =
        normUser.length > 0 &&
        (normUser === normTarget ||
          expandedUser === expandedTarget ||
          acceptedList.includes(normUser) ||
          acceptedExpanded.includes(expandedUser));

      const spokenPhrase =
        exercise.type === 'listening' ? exercise.audioTextEn : targetRaw;

      return {
        isCorrect,
        correctAnswerDisplay: targetRaw,
        spokenPhrase,
      };
    }

    case 'multiple_choice': {
      const idx = submission.selectedChoiceIndex ?? -1;
      const isCorrect = idx === exercise.correctIndex;
      const correctOption = exercise.optionsEn[exercise.correctIndex] ?? '';
      return {
        isCorrect,
        correctAnswerDisplay: correctOption,
        spokenPhrase: correctOption,
      };
    }

    case 'matching_pairs': {
      const matchedCount = (submission.matchedPairIds ?? []).length;
      const isCorrect = matchedCount >= exercise.pairs.length && exercise.pairs.length > 0;
      const summary = exercise.pairs.map((p) => `${p.en} = ${p.fa}`).join(' · ');
      const spokenPhrase = exercise.pairs.map((p) => p.en).join(', ');
      return {
        isCorrect,
        correctAnswerDisplay: summary,
        spokenPhrase,
      };
    }

    case 'fill_blank': {
      const chosen = normalizeSentence(submission.selectedBlankOption ?? '');
      const expected = normalizeSentence(exercise.blankAnswerEn);
      const isCorrect = chosen.length > 0 && chosen === expected;
      const fullSentence = `${exercise.sentenceBeforeEn} ${exercise.blankAnswerEn} ${exercise.sentenceAfterEn}`
        .replace(/\s+/g, ' ')
        .trim();
      return {
        isCorrect,
        correctAnswerDisplay: fullSentence,
        spokenPhrase: fullSentence,
      };
    }

    case 'speaking': {
      const rawSpoken = submission.spokenTranscript ?? '';
      const sim = calculatePronunciationSimilarity(
        exercise.targetPhraseEn,
        rawSpoken
      );
      const normSpoken = expandContractions(rawSpoken);
      const acceptedExpanded = (exercise.acceptedAnswers ?? []).map(
        expandContractions
      );
      const isAcceptedMatch =
        normSpoken.length > 0 && acceptedExpanded.includes(normSpoken);
      const isCorrect = sim.passed || isAcceptedMatch;

      return {
        isCorrect,
        correctAnswerDisplay: exercise.targetPhraseEn,
        spokenPhrase: exercise.targetPhraseEn,
        pronunciationScore: isAcceptedMatch ? Math.max(sim.score, 95) : sim.score,
        matchedWords: sim.matchedWords,
      };
    }
  }
}

export function calculateStepXp(baseXp: number, newCombo: number): {
  stepXp: number;
  comboBonus: number;
} {
  const safeBase = Math.max(5, baseXp);
  let comboBonus = 0;
  if (newCombo >= 4) comboBonus = 15;
  else if (newCombo === 3) comboBonus = 10;
  else if (newCombo === 2) comboBonus = 5;

  return {
    stepXp: safeBase + comboBonus,
    comboBonus,
  };
}

export function buildWordBankTokens(
  exercise: WordBankExercise | ListeningExercise,
  deterministic = false
): WordToken[] {
  const combined = [...exercise.targetEn, ...(exercise.distractorsEn ?? [])];
  const tokens: WordToken[] = combined.map((text, index) => ({
    id: `${exercise.id}_tok_${index}`,
    text,
  }));

  if (deterministic) {
    // Deterministic interleaved rotation so unit tests and previews are predictable
    return [...tokens].sort((a, b) => a.text.localeCompare(b.text));
  }

  const copy = [...tokens];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function computeWordSimilarity(wordA: string, wordB: string): number {
  const a = normalizeSentence(wordA);
  const b = normalizeSentence(wordB);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[a.length][b.length];
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, Math.round(((maxLen - distance) / maxLen) * 100));
}

export interface ConfidenceMeterState {
  score: number;
  tier: 'idle' | 'red' | 'yellow' | 'green';
  labelFa: string;
  labelEn: string;
  passed: boolean;
  matchedWords: boolean[];
  wordScores: number[];
}

export function calculateRealtimeConfidenceMeter(
  targetEn: string,
  transcriptEn: string,
  rawApiConfidence?: number
): ConfidenceMeterState {
  const targetWords = expandContractions(targetEn)
    .split(' ')
    .filter(Boolean);
  const spokenWords = expandContractions(transcriptEn)
    .split(' ')
    .filter(Boolean);

  if (targetWords.length === 0 || spokenWords.length === 0) {
    return {
      score: 0,
      tier: 'idle',
      labelFa: 'در انتظار دریافت صدا...',
      labelEn: 'Waiting for speech input...',
      passed: false,
      matchedWords: targetWords.map(() => false),
      wordScores: targetWords.map(() => 0),
    };
  }

  const wordScores = targetWords.map((tw) => {
    let best = 0;
    for (const sw of spokenWords) {
      const sim = computeWordSimilarity(tw, sw);
      if (sim > best) best = sim;
    }
    return best;
  });

  const matchedWords = wordScores.map((s) => s >= 80);
  const avgWordScore =
    wordScores.reduce((acc, val) => acc + val, 0) / targetWords.length;

  const blendedScore =
    typeof rawApiConfidence === 'number' && rawApiConfidence > 0
      ? Math.round(avgWordScore * 0.85 + rawApiConfidence * 100 * 0.15)
      : Math.round(avgWordScore);

  const score = Math.max(0, Math.min(100, blendedScore));

  if (score >= 80) {
    return {
      score,
      tier: 'green',
      labelFa: 'تلفظ عالی و دقیق',
      labelEn: 'Excellent Pronunciation',
      passed: true,
      matchedWords,
      wordScores,
    };
  }

  if (score >= 50) {
    return {
      score,
      tier: 'yellow',
      labelFa: 'تلفظ متوسط — نزدیک به هدف',
      labelEn: 'Fair Accuracy — Keep Practicing',
      passed: score >= 70,
      matchedWords,
      wordScores,
    };
  }

  return {
    score,
    tier: 'red',
    labelFa: 'نیاز به تکرار و دقت بیشتر',
    labelEn: 'Low Confidence — Try Speaking Clearly',
    passed: false,
    matchedWords,
    wordScores,
  };
}

export function calculatePronunciationSimilarity(
  targetEn: string,
  transcriptEn: string
): {
  score: number;
  passed: boolean;
  matchedWords: boolean[];
} {
  const targetWords = expandContractions(targetEn)
    .split(' ')
    .filter(Boolean);
  const spokenWords = expandContractions(transcriptEn)
    .split(' ')
    .filter(Boolean);

  if (targetWords.length === 0) {
    return { score: 0, passed: false, matchedWords: [] };
  }

  const matchedWords = targetWords.map((tw) => spokenWords.includes(tw));
  const hitCount = matchedWords.filter(Boolean).length;
  const score = Math.round((hitCount / targetWords.length) * 100);

  return {
    score,
    passed: score >= 70,
    matchedWords,
  };
}

export interface PronunciationAttemptRecord {
  id: string;
  attemptNumber: number;
  phraseEn: string;
  spokenEn: string;
  accuracy: number;
  tier: 'red' | 'yellow' | 'green';
  timestampLabel: string;
}

export interface AccuracyTrendSummary {
  averageAccuracy: number;
  peakAccuracy: number;
  latestAccuracy: number;
  improvementDelta: number;
  totalAttempts: number;
  greenCount: number;
}

export const DEFAULT_PRONUNCIATION_HISTORY: PronunciationAttemptRecord[] = [
  {
    id: 'hist_1',
    attemptNumber: 1,
    phraseEn: 'Hello, I am Sara.',
    spokenEn: 'Hello Sara',
    accuracy: 48,
    tier: 'red',
    timestampLabel: '#1',
  },
  {
    id: 'hist_2',
    attemptNumber: 2,
    phraseEn: 'I am happy today.',
    spokenEn: 'I am happy',
    accuracy: 62,
    tier: 'yellow',
    timestampLabel: '#2',
  },
  {
    id: 'hist_3',
    attemptNumber: 3,
    phraseEn: 'One hot coffee, please.',
    spokenEn: 'One hot coffee',
    accuracy: 71,
    tier: 'yellow',
    timestampLabel: '#3',
  },
  {
    id: 'hist_4',
    attemptNumber: 4,
    phraseEn: 'Here is my passport.',
    spokenEn: 'Here is my passport',
    accuracy: 84,
    tier: 'green',
    timestampLabel: '#4',
  },
  {
    id: 'hist_5',
    attemptNumber: 5,
    phraseEn: 'I learn English every day.',
    spokenEn: 'I learn English every day',
    accuracy: 91,
    tier: 'green',
    timestampLabel: '#5',
  },
  {
    id: 'hist_6',
    attemptNumber: 6,
    phraseEn: 'I feel confident today.',
    spokenEn: 'I feel confident today',
    accuracy: 96,
    tier: 'green',
    timestampLabel: '#6',
  },
];

export function computeAccuracyTrendStats(
  history: PronunciationAttemptRecord[]
): AccuracyTrendSummary {
  if (history.length === 0) {
    return {
      averageAccuracy: 0,
      peakAccuracy: 0,
      latestAccuracy: 0,
      improvementDelta: 0,
      totalAttempts: 0,
      greenCount: 0,
    };
  }

  const scores = history.map((h) => h.accuracy);
  const sum = scores.reduce((acc, s) => acc + s, 0);
  const averageAccuracy = Math.round(sum / scores.length);
  const peakAccuracy = Math.max(...scores);
  const latestAccuracy = scores[scores.length - 1];
  const firstAccuracy = scores[0];
  const improvementDelta = latestAccuracy - firstAccuracy;
  const greenCount = history.filter((h) => h.accuracy >= 80).length;

  return {
    averageAccuracy,
    peakAccuracy,
    latestAccuracy,
    improvementDelta,
    totalAttempts: history.length,
    greenCount,
  };
}

export function appendPronunciationAttempt(
  history: PronunciationAttemptRecord[],
  phraseEn: string,
  spokenEn: string,
  rawConfidence?: number
): PronunciationAttemptRecord[] {
  const meter = calculateRealtimeConfidenceMeter(
    phraseEn,
    spokenEn,
    rawConfidence
  );
  if (meter.tier === 'idle') {
    return history;
  }

  const nextNum =
    history.length > 0
      ? history[history.length - 1].attemptNumber + 1
      : 1;

  const newRecord: PronunciationAttemptRecord = {
    id: `hist_${nextNum}_${Date.now()}`,
    attemptNumber: nextNum,
    phraseEn,
    spokenEn: spokenEn.trim(),
    accuracy: meter.score,
    tier: meter.tier,
    timestampLabel: `#${nextNum}`,
  };

  const combined = [...history, newRecord];
  return combined.slice(-16);
}

export const DAILY_XP_GOAL_DEFAULT = 50;

export interface DailyMilestoneState {
  dailyXpEarned: number;
  dailyXpGoal: number;
  remainingXp: number;
  percentage: number;
  isCompleted: boolean;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyMilestoneState(
  progress: UserProgress,
  todayIso: string = getTodayIsoDate()
): DailyMilestoneState {
  const goal =
    typeof progress.dailyXpGoal === 'number' && progress.dailyXpGoal > 0
      ? progress.dailyXpGoal
      : DAILY_XP_GOAL_DEFAULT;

  const isSameDay =
    !progress.dailyMilestoneDate || progress.dailyMilestoneDate === todayIso;
  const earned = isSameDay ? Math.max(0, progress.dailyXpEarned ?? 0) : 0;
  const remainingXp = Math.max(0, goal - earned);
  const percentage = Math.min(100, Math.round((earned / goal) * 100));
  const isCompleted = earned >= goal;

  return {
    dailyXpEarned: earned,
    dailyXpGoal: goal,
    remainingXp,
    percentage,
    isCompleted,
  };
}

export function applyDailyXpProgress(
  progress: UserProgress,
  addedXp: number,
  todayIso: string = getTodayIsoDate()
): {
  nextProgress: UserProgress;
  justCompletedMilestone: boolean;
} {
  const goal =
    typeof progress.dailyXpGoal === 'number' && progress.dailyXpGoal > 0
      ? progress.dailyXpGoal
      : DAILY_XP_GOAL_DEFAULT;

  const isSameDay =
    !progress.dailyMilestoneDate || progress.dailyMilestoneDate === todayIso;
  const prevDailyXp = isSameDay ? Math.max(0, progress.dailyXpEarned ?? 0) : 0;
  const nextDailyXp = prevDailyXp + Math.max(0, addedXp);
  const alreadyCelebratedToday =
    progress.dailyMilestoneCelebratedDate === todayIso;

  const justCompletedMilestone =
    nextDailyXp >= goal && !alreadyCelebratedToday;

  return {
    justCompletedMilestone,
    nextProgress: {
      ...progress,
      xp: progress.xp + Math.max(0, addedXp),
      streak: justCompletedMilestone ? progress.streak + 1 : progress.streak,
      dailyXpEarned: nextDailyXp,
      dailyXpGoal: goal,
      dailyMilestoneDate: todayIso,
      dailyMilestoneCelebratedDate: justCompletedMilestone
        ? todayIso
        : progress.dailyMilestoneCelebratedDate,
    },
  };
}

export function validateUnitJson(rawJson: string): {
  valid: boolean;
  unit?: CurriculumUnit;
  error?: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      valid: false,
      error: 'فرمت JSON معتبر نیست. لطفاً ویرگولها و گیومهها را بررسی کنید.',
      warnings,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      error: 'ساختار ورودی باید یک شیء JSON باشد.',
      warnings,
    };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.unitId !== 'string' || !obj.unitId.trim()) {
    return { valid: false, error: 'فیلد "unitId" الزامی است.', warnings };
  }
  if (typeof obj.titleFa !== 'string' || !obj.titleFa.trim()) {
    return { valid: false, error: 'فیلد "titleFa" (عنوان فارسی) الزامی است.', warnings };
  }
  if (typeof obj.titleEn !== 'string' || !obj.titleEn.trim()) {
    return { valid: false, error: 'فیلد "titleEn" (عنوان انگلیسی) الزامی است.', warnings };
  }
  if (!Array.isArray(obj.words) || obj.words.length === 0) {
    return { valid: false, error: 'آرایه "words" باید حداقل شامل یک کلمه باشد.', warnings };
  }
  if (!Array.isArray(obj.exercises) || obj.exercises.length === 0) {
    return { valid: false, error: 'آرایه "exercises" باید حداقل شامل یک تمرین باشد.', warnings };
  }

  // Check if exercises reference words not in the unit's words list
  const definedWords = new Set(
    (obj.words as Array<Record<string, unknown>>)
      .map((w) => String(w.en ?? '').toLowerCase().trim())
      .filter(Boolean)
  );

  for (const rawEx of obj.exercises as Array<Record<string, unknown>>) {
    if (typeof rawEx.grammarTipFa === 'string' && rawEx.grammarTipFa.includes('همیشه در ابتدای جمله')) {
      warnings.push(
        `نکته گرامری تمرین "${String(rawEx.id ?? '')}" نیاز به اصلاح دارد: ضمیر «I» همیشه با حرف بزرگ نوشته میشود، اما الزاماً در ابتدای جمله نمیآید.`
      );
    }
    if (Array.isArray(rawEx.targetEn)) {
      for (const tok of rawEx.targetEn) {
        const cleanTok = String(tok).toLowerCase().trim();
        if (cleanTok && !definedWords.has(cleanTok) && cleanTok !== 'sara' && cleanTok !== 'ali') {
          warnings.push(
            `کلمه "${String(tok)}" در تمرین "${String(rawEx.id ?? '')}" به کار رفته اما در آرایه words تعریف نشده است.`
          );
        }
      }
    }
  }

  const normalizedUnit: CurriculumUnit = {
    unitId: String(obj.unitId),
    order: typeof obj.order === 'number' ? obj.order : 99,
    level:
      obj.level === 'A2' ||
      obj.level === 'B1' ||
      obj.level === 'B2' ||
      obj.level === 'C1' ||
      obj.level === 'C2'
        ? obj.level
        : 'A1',
    titleFa: String(obj.titleFa),
    titleEn: String(obj.titleEn),
    subtitleFa:
      typeof obj.subtitleFa === 'string'
        ? obj.subtitleFa
        : 'یونیت سفارشی ساختهشده در استودیو JSON',
    accentGradient:
      typeof obj.accentGradient === 'string'
        ? obj.accentGradient
        : 'from-emerald-400 to-cyan-400',
    badgeIcon: typeof obj.badgeIcon === 'string' ? obj.badgeIcon : '✨',
    xpReward: typeof obj.xpReward === 'number' ? obj.xpReward : 60,
    words: (obj.words as Array<Record<string, unknown>>).map((w, idx) => ({
      id: String(w.id ?? `w_custom_${idx}`),
      en: String(w.en ?? ''),
      fa: String(w.fa ?? ''),
      phoneticFa: String(w.phoneticFa ?? ''),
      posFa: String(w.posFa ?? 'واژه'),
      emoji: String(w.emoji ?? '📘'),
      category:
        w.category === 'cafe' ||
        w.category === 'travel' ||
        w.category === 'tech' ||
        w.category === 'daily' ||
        w.category === 'feelings' ||
        w.category === 'business' ||
        w.category === 'academic' ||
        w.category === 'mastery'
          ? w.category
          : 'greetings',
      audioUrl: typeof w.audioUrl === 'string' ? w.audioUrl : undefined,
      exampleEn: String(w.exampleEn ?? `${String(w.en ?? '')}!`),
      exampleFa: String(w.exampleFa ?? `${String(w.fa ?? '')}!`),
    })),
    exercises: (obj.exercises as Array<Record<string, unknown>>).map((ex, idx) => {
      const exId = String(ex.id ?? `ex_custom_${idx}`);
      const promptFa = String(ex.promptFa ?? 'پاسخ درست را انتخاب کنید:');
      const grammarTipFa = String(
        ex.grammarTipFa ?? 'به ساختار فاعل و فعل در جمله انگلیسی دقت کنید.'
      );

      if (ex.type === 'multiple_choice') {
        return {
          id: exId,
          type: 'multiple_choice',
          promptFa,
          sourceFa: String(ex.sourceFa ?? ''),
          optionsEn: Array.isArray(ex.optionsEn) ? ex.optionsEn.map(String) : ['Hello', 'Goodbye'],
          correctIndex: typeof ex.correctIndex === 'number' ? ex.correctIndex : 0,
          grammarTipFa,
        };
      }

      if (ex.type === 'listening') {
        const targetEn = Array.isArray(ex.targetEn) ? ex.targetEn.map(String) : ['Hello'];
        return {
          id: exId,
          type: 'listening',
          promptFa,
          audioTextEn: String(ex.audioTextEn ?? targetEn.join(' ')),
          meaningFa: String(ex.meaningFa ?? ''),
          targetEn,
          acceptedAnswers: Array.isArray(ex.acceptedAnswers)
            ? ex.acceptedAnswers.map(String)
            : undefined,
          distractorsEn: Array.isArray(ex.distractorsEn) ? ex.distractorsEn.map(String) : [],
          grammarTipFa,
        };
      }

      if (ex.type === 'speaking') {
        return {
          id: exId,
          type: 'speaking',
          promptFa: String(ex.promptFa ?? 'این جمله را با صدای بلند به انگلیسی تلفظ کنید:'),
          sourceFa: String(ex.sourceFa ?? ''),
          targetPhraseEn: String(ex.targetPhraseEn ?? 'Hello, I am Sara'),
          phoneticFa: String(ex.phoneticFa ?? ''),
          acceptedAnswers: Array.isArray(ex.acceptedAnswers)
            ? ex.acceptedAnswers.map(String)
            : undefined,
          grammarTipFa,
        };
      }

      // Default to word_bank (matches user's original JSON snippet)
      const targetEn = Array.isArray(ex.targetEn) ? ex.targetEn.map(String) : ['Hello'];
      return {
        id: exId,
        type: 'word_bank',
        promptFa,
        sourceFa: String(ex.sourceFa ?? ''),
        targetEn,
        acceptedAnswers: Array.isArray(ex.acceptedAnswers)
          ? ex.acceptedAnswers.map(String)
          : undefined,
        distractorsEn: Array.isArray(ex.distractorsEn) ? ex.distractorsEn.map(String) : [],
        grammarTipFa,
      };
    }),
  };

  return {
    valid: true,
    unit: normalizedUnit,
    warnings,
  };
}

export interface QuickReviewQuestion {
  id: string;
  wordId: string;
  en: string;
  fa: string;
  phoneticFa: string;
  emoji: string;
  optionsFa: string[];
  correctIndex: number;
}

export function buildQuickReviewQuestions(
  units: CurriculumUnit[],
  limit = 5,
  seedOffset = 0
): QuickReviewQuestion[] {
  const allWords = units.flatMap((u) => u.words);
  if (allWords.length === 0) return [];

  const count = Math.min(limit, allWords.length);
  const questions: QuickReviewQuestion[] = [];

  for (let i = 0; i < count; i++) {
    const idx = (i * 3 + seedOffset) % allWords.length;
    const target = allWords[idx];
    const distractors: string[] = [];

    for (let step = 1; step < allWords.length && distractors.length < 3; step++) {
      const candidate = allWords[(idx + step * 2) % allWords.length];
      if (candidate.id !== target.id && !distractors.includes(candidate.fa)) {
        distractors.push(candidate.fa);
      }
    }

    const correctIndex = (idx + i) % (distractors.length + 1);
    const optionsFa = [...distractors];
    optionsFa.splice(correctIndex, 0, target.fa);

    questions.push({
      id: `qr_${target.id}_${i}`,
      wordId: target.id,
      en: target.en,
      fa: target.fa,
      phoneticFa: target.phoneticFa,
      emoji: target.emoji,
      optionsFa,
      correctIndex,
    });
  }

  return questions;
}

export interface CheckpointQuestion {
  id: string;
  unitId: string;
  unitTitleFa: string;
  unitTitleEn: string;
  kind: 'meaning' | 'reverse_meaning' | 'fill_blank' | 'multiple_choice';
  promptFa: string;
  promptEn: string;
  stimulus: string;
  stimulusIsEn: boolean;
  audioTextEn?: string;
  options: string[];
  correctIndex: number;
  explanationFa: string;
  explanationEn: string;
}

export interface CheckpointGradeResult {
  correctCount: number;
  totalCount: number;
  percentage: number;
  passed: boolean;
  earnedXp: number;
}

export function buildUnitCheckpointQuestions(
  unit: CurriculumUnit,
  allUnits: CurriculumUnit[],
  seedOffset = 0
): CheckpointQuestion[] {
  const poolWords = allUnits.flatMap((u) => u.words);
  const questions: CheckpointQuestion[] = [];

  // 1. Vocabulary English -> Farsi meaning questions (up to 3)
  const vocabSampleCount = Math.min(3, unit.words.length);
  for (let i = 0; i < vocabSampleCount; i++) {
    const word = unit.words[(i + seedOffset) % unit.words.length];
    const distractors: string[] = [];
    for (
      let step = 1;
      step < poolWords.length && distractors.length < 3;
      step++
    ) {
      const candidate = poolWords[(i + step * 3 + seedOffset) % poolWords.length];
      if (candidate.id !== word.id && !distractors.includes(candidate.fa)) {
        distractors.push(candidate.fa);
      }
    }
    const correctIndex = (i + seedOffset) % (distractors.length + 1);
    const options = [...distractors];
    options.splice(correctIndex, 0, word.fa);

    questions.push({
      id: `chk_${unit.unitId}_m_${word.id}`,
      unitId: unit.unitId,
      unitTitleFa: unit.titleFa,
      unitTitleEn: unit.titleEn,
      kind: 'meaning',
      promptFa: 'معنای دقیق این واژه یا عبارت انگلیسی کدام است؟',
      promptEn: 'Choose the accurate Persian meaning for this word:',
      stimulus: word.en,
      stimulusIsEn: true,
      audioTextEn: word.en,
      options,
      correctIndex,
      explanationFa: `«${word.en}» (تلفظ: ${word.phoneticFa}) به معنای «${word.fa}» است. مثال: ${word.exampleEn}`,
      explanationEn: `"${word.en}" means "${word.fa}". Example: ${word.exampleEn}`,
    });
  }

  // 2. Reverse Farsi -> English word recall (1-2 questions)
  if (unit.words.length > 0) {
    const revWord = unit.words[(vocabSampleCount + seedOffset) % unit.words.length];
    const enDistractors: string[] = [];
    for (
      let step = 1;
      step < poolWords.length && enDistractors.length < 3;
      step++
    ) {
      const candidate = poolWords[(step * 5 + seedOffset) % poolWords.length];
      if (candidate.id !== revWord.id && !enDistractors.includes(candidate.en)) {
        enDistractors.push(candidate.en);
      }
    }
    const correctIndex = (seedOffset + 1) % (enDistractors.length + 1);
    const options = [...enDistractors];
    options.splice(correctIndex, 0, revWord.en);

    questions.push({
      id: `chk_${unit.unitId}_rev_${revWord.id}`,
      unitId: unit.unitId,
      unitTitleFa: unit.titleFa,
      unitTitleEn: unit.titleEn,
      kind: 'reverse_meaning',
      promptFa: 'معادل انگلیسی این عبارت کدام است؟',
      promptEn: 'Select the matching English translation:',
      stimulus: revWord.fa,
      stimulusIsEn: false,
      audioTextEn: revWord.en,
      options,
      correctIndex,
      explanationFa: `معادل صحیح «${revWord.fa}» برابر «${revWord.en}» است.`,
      explanationEn: `The English match for "${revWord.fa}" is "${revWord.en}".`,
    });
  }

  // 3. Grammar & Comprehension checks from the unit's exercises
  for (const ex of unit.exercises) {
    if (ex.type === 'fill_blank') {
      const uniqueOpts = Array.from(new Set(ex.optionsEn));
      const correctIdx = uniqueOpts.indexOf(ex.blankAnswerEn);
      if (correctIdx >= 0 && uniqueOpts.length >= 2) {
        questions.push({
          id: `chk_${unit.unitId}_fb_${ex.id}`,
          unitId: unit.unitId,
          unitTitleFa: unit.titleFa,
          unitTitleEn: unit.titleEn,
          kind: 'fill_blank',
          promptFa: `${ex.promptFa} (${ex.sourceFa})`,
          promptEn: `Complete the sentence: "${ex.sourceFa}"`,
          stimulus: `${ex.sentenceBeforeEn ? ex.sentenceBeforeEn + ' ' : ''}____${ex.sentenceAfterEn ? ' ' + ex.sentenceAfterEn : ''}`.trim(),
          stimulusIsEn: true,
          audioTextEn: `${ex.sentenceBeforeEn} ${ex.blankAnswerEn} ${ex.sentenceAfterEn}`.trim(),
          options: uniqueOpts,
          correctIndex: correctIdx,
          explanationFa: ex.grammarTipFa,
          explanationEn: ex.grammarTipFa,
        });
      }
    } else if (ex.type === 'multiple_choice' && ex.optionsEn.length >= 2) {
      questions.push({
        id: `chk_${unit.unitId}_mc_${ex.id}`,
        unitId: unit.unitId,
        unitTitleFa: unit.titleFa,
        unitTitleEn: unit.titleEn,
        kind: 'multiple_choice',
        promptFa: ex.promptFa,
        promptEn: 'Choose the best English expression:',
        stimulus: ex.sourceFa,
        stimulusIsEn: false,
        audioTextEn: ex.optionsEn[ex.correctIndex],
        options: [...ex.optionsEn],
        correctIndex: ex.correctIndex,
        explanationFa: ex.grammarTipFa,
        explanationEn: ex.grammarTipFa,
      });
    }
  }

  return questions.slice(0, 6);
}

export function buildCourseFinalTestQuestions(
  units: CurriculumUnit[],
  seedOffset = 0
): CheckpointQuestion[] {
  const collected: CheckpointQuestion[] = [];
  for (const unit of units) {
    const unitQs = buildUnitCheckpointQuestions(unit, units, seedOffset);
    // Take 1 vocabulary/reverse question and 1 grammar/comprehension question per unit
    const vocabQ = unitQs.find((q) => q.kind === 'meaning' || q.kind === 'reverse_meaning');
    const grammarQ = unitQs.find((q) => q.kind === 'fill_blank' || q.kind === 'multiple_choice');
    if (vocabQ) collected.push(vocabQ);
    if (grammarQ) {
      collected.push(grammarQ);
    } else if (unitQs[1]) {
      collected.push(unitQs[1]);
    }
  }
  return collected;
}

export function gradeCheckpointTest(
  questions: CheckpointQuestion[],
  selectedAnswers: Record<string, number>,
  xpBonusOnPass = 40
): CheckpointGradeResult {
  const totalCount = questions.length;
  if (totalCount === 0) {
    return { correctCount: 0, totalCount: 0, percentage: 0, passed: false, earnedXp: 0 };
  }

  let correctCount = 0;
  for (const q of questions) {
    if (selectedAnswers[q.id] === q.correctIndex) {
      correctCount += 1;
    }
  }

  const percentage = Math.round((correctCount / totalCount) * 100);
  const passed = percentage >= 75;
  const earnedXp = passed ? xpBonusOnPass : Math.max(5, correctCount * 5);

  return {
    correctCount,
    totalCount,
    percentage,
    passed,
    earnedXp,
  };
}

export interface SpeedMatchPair {
  id: string;
  en: string;
  fa: string;
  phoneticFa: string;
  emoji: string;
}

export function buildSpeedMatchDeck(
  units: CurriculumUnit[],
  pairCount = 6,
  seedOffset = 0
): SpeedMatchPair[] {
  const allWords = units.flatMap((u) => u.words);
  if (allWords.length === 0) return [];

  const targetCount = Math.min(pairCount, allWords.length);
  const picked: SpeedMatchPair[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < allWords.length && picked.length < targetCount; i++) {
    const idx = (i * 5 + seedOffset * 3) % allWords.length;
    const word = allWords[idx];
    if (!usedIds.has(word.id)) {
      usedIds.add(word.id);
      picked.push({
        id: word.id,
        en: word.en,
        fa: word.fa,
        phoneticFa: word.phoneticFa,
        emoji: word.emoji,
      });
    }
  }

  return picked;
}
