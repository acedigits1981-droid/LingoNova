import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSentence,
  expandContractions,
  evaluateExerciseAnswer,
  calculateStepXp,
  calculatePronunciationSimilarity,
  calculateRealtimeConfidenceMeter,
  DEFAULT_PRONUNCIATION_HISTORY,
  computeAccuracyTrendStats,
  appendPronunciationAttempt,
  getDailyMilestoneState,
  applyDailyXpProgress,
  validateUnitJson,
  buildQuickReviewQuestions,
  buildUnitCheckpointQuestions,
  buildCourseFinalTestQuestions,
  gradeCheckpointTest,
  buildSpeedMatchDeck,
} from './lessonEngine';
import { ENGLISH_ALPHABET } from './alphabetData';
import { INITIAL_UNITS } from '../data/curriculum';
import {
  WordBankExercise,
  MultipleChoiceExercise,
  MatchingPairsExercise,
  FillBlankExercise,
  SpeakingExercise,
} from '../types/curriculum';

test('normalizeSentence strips punctuation and collapses whitespace', () => {
  assert.equal(normalizeSentence('  Hello,   I am Sara! '), 'hello i am sara');
  assert.equal(expandContractions("Hello, I'm Sara."), 'hello i am sara');
});

test('evaluateExerciseAnswer accepts exact target and contraction variants in word_bank', () => {
  const ex101: WordBankExercise = {
    id: 'ex_101',
    type: 'word_bank',
    promptFa: 'این جمله را به انگلیسی بسازید:',
    sourceFa: 'سلام، من سارا هستم',
    targetEn: ['Hello', 'I', 'am', 'Sara'],
    acceptedAnswers: ["Hello, I'm Sara"],
    distractorsEn: ['water', 'apple', 'you'],
    grammarTipFa:
      'در انگلیسی «I am» یعنی «من هستم» و ضمیر «I» در هر جای جمله که باشد همیشه با حرف بزرگ نوشته میشود.',
  };

  const exactRes = evaluateExerciseAnswer(ex101, {
    selectedTokens: ['Hello', 'I', 'am', 'Sara'],
  });
  assert.equal(exactRes.isCorrect, true);

  const contractionRes = evaluateExerciseAnswer(ex101, {
    selectedTokens: ['Hello', "I'm", 'Sara'],
  });
  assert.equal(contractionRes.isCorrect, true);

  const wrongRes = evaluateExerciseAnswer(ex101, {
    selectedTokens: ['Hello', 'you', 'am', 'Sara'],
  });
  assert.equal(wrongRes.isCorrect, false);
});

test('evaluateExerciseAnswer validates multiple_choice, matching_pairs, and fill_blank', () => {
  const mc: MultipleChoiceExercise = {
    id: 'ex_102',
    type: 'multiple_choice',
    promptFa: 'معادل انگلیسی «صبح بخیر» کدام است؟',
    sourceFa: 'صبح بخیر',
    optionsEn: ['Good night', 'Good morning', 'Goodbye', 'I am good'],
    correctIndex: 1,
    grammarTipFa: 'Good morning تا ظهر استفاده میشود.',
  };

  assert.equal(evaluateExerciseAnswer(mc, { selectedChoiceIndex: 1 }).isCorrect, true);
  assert.equal(evaluateExerciseAnswer(mc, { selectedChoiceIndex: 0 }).isCorrect, false);

  const mp: MatchingPairsExercise = {
    id: 'ex_104',
    type: 'matching_pairs',
    promptFa: 'کلمات هممعنی را جفت کنید:',
    pairs: [
      { id: 'p1', en: 'Hello', fa: 'سلام', phoneticFa: 'هِلو' },
      { id: 'p2', en: 'Goodbye', fa: 'خداحافظ', phoneticFa: 'گودبای' },
    ],
    grammarTipFa: 'جفتسازی لغات به تثبیت حافظه تصویری کمک میکند.',
  };

  assert.equal(evaluateExerciseAnswer(mp, { matchedPairIds: ['p1', 'p2'] }).isCorrect, true);
  assert.equal(evaluateExerciseAnswer(mp, { matchedPairIds: ['p1'] }).isCorrect, false);

  const fb: FillBlankExercise = {
    id: 'ex_105',
    type: 'fill_blank',
    promptFa: 'جای خالی را پر کنید:',
    sourceFa: 'من دانشآموز هستم',
    sentenceBeforeEn: 'I',
    sentenceAfterEn: 'a student.',
    blankAnswerEn: 'am',
    optionsEn: ['am', 'are', 'is'],
    grammarTipFa: 'برای ضمیر I همیشه از فعل am استفاده میشود.',
  };

  assert.equal(evaluateExerciseAnswer(fb, { selectedBlankOption: 'am' }).isCorrect, true);
  assert.equal(evaluateExerciseAnswer(fb, { selectedBlankOption: 'are' }).isCorrect, false);
});

test('calculateStepXp computes combo bonuses accurately', () => {
  assert.deepEqual(calculateStepXp(15, 1), { stepXp: 15, comboBonus: 0 });
  assert.deepEqual(calculateStepXp(15, 2), { stepXp: 20, comboBonus: 5 });
  assert.deepEqual(calculateStepXp(15, 3), { stepXp: 25, comboBonus: 10 });
  assert.deepEqual(calculateStepXp(15, 5), { stepXp: 30, comboBonus: 15 });
});

test('calculatePronunciationSimilarity scores spoken words against target phrase', () => {
  const res = calculatePronunciationSimilarity('Hello I am Sara', "Hello, I'm Sara!");
  assert.equal(res.score, 100);
  assert.equal(res.passed, true);
  assert.deepEqual(res.matchedWords, [true, true, true, true]);
});

test('calculateRealtimeConfidenceMeter returns green, yellow, red, and idle tiers accurately', () => {
  const idleState = calculateRealtimeConfidenceMeter('Hello I am Sara', '');
  assert.equal(idleState.tier, 'idle');
  assert.equal(idleState.score, 0);

  const greenState = calculateRealtimeConfidenceMeter(
    'Hello I am Sara',
    "Hello, I'm Sara"
  );
  assert.equal(greenState.tier, 'green');
  assert.ok(greenState.score >= 80);
  assert.equal(greenState.passed, true);

  const yellowState = calculateRealtimeConfidenceMeter(
    'Hello I am Sara',
    'Hello I'
  );
  assert.equal(yellowState.tier, 'yellow');
  assert.ok(yellowState.score >= 50 && yellowState.score < 80);

  const redState = calculateRealtimeConfidenceMeter(
    'Hello I am Sara',
    'xyz'
  );
  assert.equal(redState.tier, 'red');
  assert.ok(redState.score < 50);
  assert.equal(redState.passed, false);
});

test('evaluateExerciseAnswer evaluates speaking exercises with SpeechRecognition transcripts', () => {
  const spk: SpeakingExercise = {
    id: 'ex_106',
    type: 'speaking',
    promptFa: 'این جمله را با صدای بلند به انگلیسی تلفظ کنید:',
    sourceFa: 'سلام، من سارا هستم',
    targetPhraseEn: 'Hello, I am Sara',
    phoneticFa: 'هِلو، آی اَم سارا',
    acceptedAnswers: ["Hello I'm Sara"],
    grammarTipFa: 'تلفظ واضح ضمیر I و فعل am به روان شدن مکالمه کمک میکند.',
  };

  const passExact = evaluateExerciseAnswer(spk, {
    spokenTranscript: "Hello, I'm Sara!",
  });
  assert.equal(passExact.isCorrect, true);
  assert.equal(passExact.pronunciationScore, 100);

  const passPartial = evaluateExerciseAnswer(spk, {
    spokenTranscript: 'Hello I am',
  });
  assert.equal(passPartial.isCorrect, true);
  assert.equal(passPartial.pronunciationScore, 75);

  const failLow = evaluateExerciseAnswer(spk, {
    spokenTranscript: 'water apple',
  });
  assert.equal(failLow.isCorrect, false);
  assert.equal(failLow.pronunciationScore, 0);
});

test('computeAccuracyTrendStats and appendPronunciationAttempt track historical accuracy progression', () => {
  const initialStats = computeAccuracyTrendStats(DEFAULT_PRONUNCIATION_HISTORY);
  assert.equal(initialStats.totalAttempts, 6);
  assert.equal(initialStats.peakAccuracy, 96);
  assert.equal(initialStats.improvementDelta, 48); // 96 - 48
  assert.equal(initialStats.greenCount, 3);

  const updated = appendPronunciationAttempt(
    DEFAULT_PRONUNCIATION_HISTORY,
    'Hello, I am Sara.',
    'Hello, I am Sara.',
    0.98
  );
  assert.equal(updated.length, 7);
  assert.equal(updated[6].attemptNumber, 7);
  assert.equal(updated[6].tier, 'green');
  assert.ok(updated[6].accuracy >= 95);
});

test('getDailyMilestoneState and applyDailyXpProgress celebrate daily XP streak goal once per day', () => {
  const today = '2026-11-15';
  const baseProgress = {
    xp: 180,
    streak: 4,
    completedUnitIds: [],
    masteredWordIds: ['w_hello'],
    lessonsCompletedToday: 0,
    perfectLessonsCount: 0,
    wordsReviewedToday: 1,
    dailyXpEarned: 35,
    dailyXpGoal: 50,
    dailyMilestoneDate: today,
  };

  const before = getDailyMilestoneState(baseProgress, today);
  assert.equal(before.isCompleted, false);
  assert.equal(before.remainingXp, 15);
  assert.equal(before.percentage, 70);

  // Earning 15 XP crosses the 50 XP daily goal and triggers celebration
  const step1 = applyDailyXpProgress(baseProgress, 15, today);
  assert.equal(step1.justCompletedMilestone, true);
  assert.equal(step1.nextProgress.dailyXpEarned, 50);
  assert.equal(step1.nextProgress.streak, 5);
  assert.equal(step1.nextProgress.dailyMilestoneCelebratedDate, today);

  const after = getDailyMilestoneState(step1.nextProgress, today);
  assert.equal(after.isCompleted, true);
  assert.equal(after.remainingXp, 0);
  assert.equal(after.percentage, 100);

  // Subsequent XP earned on the same day should not re-trigger celebration or double-increment streak
  const step2 = applyDailyXpProgress(step1.nextProgress, 20, today);
  assert.equal(step2.justCompletedMilestone, false);
  assert.equal(step2.nextProgress.dailyXpEarned, 70);
  assert.equal(step2.nextProgress.streak, 5);
});

test('validateUnitJson parses user JSON schema and flags pedagogical warnings', () => {
  const userSampleJson = JSON.stringify({
    unitId: 'unit-1',
    titleFa: 'احوالپرسی و کلمات پایه',
    titleEn: 'Greetings & Basics',
    words: [
      {
        id: 'w_hello',
        en: 'Hello',
        fa: 'سلام',
        phoneticFa: 'هِلو',
        emoji: '👋',
        category: 'greetings',
        audioUrl: '/audio/en/hello.mp3',
      },
    ],
    exercises: [
      {
        id: 'ex_101',
        type: 'word_bank',
        promptFa: 'این جمله را به انگلیسی بسازید:',
        sourceFa: 'سلام، من سارا هستم',
        targetEn: ['Hello', 'I', 'am', 'Sara'],
        distractorsEn: ['water', 'apple', 'you'],
        grammarTipFa: 'در انگلیسی «I am» یعنی «من هستم» و همیشه در ابتدای جمله میآید.',
      },
    ],
  });

  const validation = validateUnitJson(userSampleJson);
  assert.equal(validation.valid, true);
  assert.equal(validation.unit?.unitId, 'unit-1');
  assert.ok(validation.warnings.length >= 2);
});

test('buildQuickReviewQuestions builds 4 distinct Farsi options including exact target answer', () => {
  const questions = buildQuickReviewQuestions(INITIAL_UNITS, 5, 0);
  assert.equal(questions.length, 5);
  for (const q of questions) {
    assert.equal(q.optionsFa.length, 4);
    assert.equal(q.optionsFa[q.correctIndex], q.fa);
    assert.equal(new Set(q.optionsFa).size, 4);
  }
});

test('buildUnitCheckpointQuestions & buildCourseFinalTestQuestions cover unit tasks and grade passes cleanly', () => {
  const unit1Qs = buildUnitCheckpointQuestions(INITIAL_UNITS[0], INITIAL_UNITS, 0);
  assert.ok(unit1Qs.length >= 4);
  for (const q of unit1Qs) {
    assert.ok(q.options.length >= 3);
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length);
    assert.equal(new Set(q.options).size, q.options.length);
  }

  const finalQs = buildCourseFinalTestQuestions(INITIAL_UNITS, 0);
  const coveredUnits = new Set(finalQs.map((q) => q.unitId));
  assert.equal(coveredUnits.size, INITIAL_UNITS.length);

  // Pass grade (>=75%)
  const allCorrect: Record<string, number> = {};
  for (const q of unit1Qs) allCorrect[q.id] = q.correctIndex;
  const passGrade = gradeCheckpointTest(unit1Qs, allCorrect, 40);
  assert.equal(passGrade.passed, true);
  assert.equal(passGrade.percentage, 100);
  assert.equal(passGrade.earnedXp, 40);

  // Fail grade (<75%)
  const failGrade = gradeCheckpointTest(unit1Qs, {}, 40);
  assert.equal(failGrade.passed, false);
  assert.equal(failGrade.percentage, 0);
});

test('buildSpeedMatchDeck returns unique EN/FA word pairs and ENGLISH_ALPHABET contains A-Z', () => {
  const deck = buildSpeedMatchDeck(INITIAL_UNITS, 6, 1);
  assert.equal(deck.length, 6);
  assert.equal(new Set(deck.map((p) => p.id)).size, 6);

  assert.equal(ENGLISH_ALPHABET.length, 26);
  assert.equal(ENGLISH_ALPHABET[0].letter, 'A');
  assert.equal(ENGLISH_ALPHABET[25].letter, 'Z');
  assert.equal(new Set(ENGLISH_ALPHABET.map((a) => a.letter)).size, 26);
});

test('INITIAL_UNITS spans full CEFR A1-C2 curriculum and validates C2 mastery units', () => {
  assert.equal(INITIAL_UNITS.length, 9);
  const levels = INITIAL_UNITS.map((u) => u.level);
  assert.deepEqual(levels, ['A1', 'A1', 'A1', 'A2', 'A2', 'B1', 'B2', 'C1', 'C2']);

  const finalQuestions = buildCourseFinalTestQuestions(INITIAL_UNITS, 0);
  assert.equal(finalQuestions.length, 18);
  assert.equal(new Set(finalQuestions.map((q) => q.unitId)).size, 9);

  const c2SampleJson = JSON.stringify({
    unitId: 'unit-c2-custom',
    level: 'C2',
    titleFa: 'بلاغت پیشرفته',
    titleEn: 'Advanced Rhetoric',
    words: [
      {
        id: 'w_nuance_custom',
        en: 'Eloquent',
        fa: 'سخنور و شیوا',
        phoneticFa: 'اِلُکوئنت',
        emoji: '🎙️',
        category: 'mastery',
      },
    ],
    exercises: [
      {
        id: 'ex_c2_custom',
        type: 'word_bank',
        promptFa: 'جمله را بسازید:',
        sourceFa: 'او سخنور است',
        targetEn: ['She', 'is', 'eloquent'],
        distractorsEn: ['apple'],
        grammarTipFa: 'صفت eloquent برای توصیف بیان شیوا و متقاعدکننده به کار می‌رود.',
      },
    ],
  });

  const c2Validation = validateUnitJson(c2SampleJson);
  assert.equal(c2Validation.valid, true);
  assert.equal(c2Validation.unit?.level, 'C2');
  assert.equal(c2Validation.unit?.words[0].category, 'mastery');
});

