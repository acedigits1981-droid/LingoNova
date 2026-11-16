import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Layers,
  Zap,
  Volume2,
  Check,
  AlertCircle,
  RotateCcw,
  Gamepad2,
  ClipboardCheck,
  Trophy,
  Sparkles,
  Shuffle,
  Clock,
} from 'lucide-react';
import { CurriculumUnit } from '../types/curriculum';
import {
  buildQuickReviewQuestions,
  buildSpeedMatchDeck,
} from '../utils/lessonEngine';
import { soundFX, speakEnglish } from '../utils/soundEngine';
import { triggerConfettiCelebration } from './ParticleCanvas';
import { LexiconView } from './LexiconView';
import { AlphabetMiniStrip } from './AlphabetMiniStrip';
import { UiLanguageMode } from './PronunciationLabView';

type PracticeTab =
  | 'flashcards'
  | 'match_game'
  | 'quick_quiz'
  | 'tests'
  | 'lexicon';

interface PracticeHubViewProps {
  units: CurriculumUnit[];
  masteredWordIds: string[];
  completedUnitIds?: string[];
  passedCheckpointIds?: string[];
  onToggleMasteredWord: (wordId: string) => void;
  onOpenFlashcards: (unitId: string) => void;
  onOpenAllFlashcards?: () => void;
  onStartUnitCheckpoint?: (unitId: string) => void;
  onStartFinalExam?: () => void;
  onEarnPracticeXp: (amount: number) => void;
  uiLang?: UiLanguageMode;
}

export const PracticeHubView: React.FC<PracticeHubViewProps> = ({
  units,
  masteredWordIds,
  completedUnitIds = [],
  passedCheckpointIds = [],
  onToggleMasteredWord,
  onOpenFlashcards,
  onOpenAllFlashcards,
  onStartUnitCheckpoint,
  onStartFinalExam,
  onEarnPracticeXp,
  uiLang = 'fa',
}) => {
  const [subTab, setSubTab] = useState<PracticeTab>('flashcards');

  // Quick Quiz state
  const [quizSeed, setQuizSeed] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Speed Match Mini-Game state
  const [matchSeed, setMatchSeed] = useState(0);
  const [selectedEnId, setSelectedEnId] = useState<string | null>(null);
  const [selectedFaId, setSelectedFaId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [matchCombo, setMatchCombo] = useState(0);
  const [mismatchPair, setMismatchPair] = useState(false);
  const [timedMode, setTimedMode] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [matchRoundWon, setMatchRoundWon] = useState(false);

  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);

  const questions = useMemo(
    () => buildQuickReviewQuestions(units, 5, quizSeed),
    [units, quizSeed]
  );
  const activeQuestion = questions[questionIdx] ?? questions[0];

  const matchPairs = useMemo(
    () => buildSpeedMatchDeck(units, 6, matchSeed),
    [units, matchSeed]
  );

  // Offset Persian column deterministically so cards aren't side-by-side
  const shuffledFaMatchPairs = useMemo(() => {
    if (matchPairs.length <= 1) return matchPairs;
    const copy = [...matchPairs];
    const rotated = [...copy.slice(2), ...copy.slice(0, 2)].reverse();
    return rotated;
  }, [matchPairs]);

  // Countdown timer only when actively playing Speed Match in Timed Mode
  useEffect(() => {
    if (
      subTab !== 'match_game' ||
      !timedMode ||
      matchRoundWon ||
      secondsLeft <= 0
    ) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [subTab, timedMode, matchRoundWon, secondsLeft]);

  const handleRestartMatchGame = (nextTimed?: boolean) => {
    soundFX.tap();
    if (typeof nextTimed === 'boolean') setTimedMode(nextTimed);
    setMatchSeed((s) => s + 1);
    setSelectedEnId(null);
    setSelectedFaId(null);
    setMatchedIds([]);
    setMatchCombo(0);
    setMismatchPair(false);
    setSecondsLeft(45);
    setMatchRoundWon(false);
  };

  const evaluateMatchAttempt = (enId: string | null, faId: string | null) => {
    if (!enId || !faId) return;
    if (enId === faId) {
      soundFX.match();
      const nextMatched = [...matchedIds, enId];
      setMatchedIds(nextMatched);
      setMatchCombo((c) => c + 1);
      setSelectedEnId(null);
      setSelectedFaId(null);

      if (nextMatched.length >= matchPairs.length) {
        setMatchRoundWon(true);
        soundFX.complete();
        onEarnPracticeXp(30);
        triggerConfettiCelebration(
          window.innerWidth * 0.5,
          window.innerHeight * 0.35,
          80
        );
      }
    } else {
      soundFX.error();
      setMatchCombo(0);
      setMismatchPair(true);
      setTimeout(() => {
        setMismatchPair(false);
        setSelectedEnId(null);
        setSelectedFaId(null);
      }, 420);
    }
  };

  const handlePickMatchTile = (side: 'en' | 'fa', id: string, wordEn?: string) => {
    if (matchedIds.includes(id) || matchRoundWon || (timedMode && secondsLeft === 0)) {
      return;
    }
    soundFX.tap();
    if (side === 'en') {
      if (wordEn) speakEnglish(wordEn, 0.94);
      const nextEn = selectedEnId === id ? null : id;
      setSelectedEnId(nextEn);
      if (nextEn && selectedFaId) {
        evaluateMatchAttempt(nextEn, selectedFaId);
      }
    } else {
      const nextFa = selectedFaId === id ? null : id;
      setSelectedFaId(nextFa);
      if (selectedEnId && nextFa) {
        evaluateMatchAttempt(selectedEnId, nextFa);
      }
    }
  };

  const handleAnswerQuiz = (optIndex: number) => {
    if (selectedOpt !== null || !activeQuestion) return;
    setSelectedOpt(optIndex);
    const isCorrect = optIndex === activeQuestion.correctIndex;
    if (isCorrect) {
      soundFX.success();
      setQuizCorrectCount((c) => c + 1);
      onEarnPracticeXp(5);
    } else {
      soundFX.error();
    }
  };

  const handleNextQuestion = () => {
    soundFX.tap();
    if (questionIdx + 1 >= questions.length) {
      setQuizFinished(true);
      soundFX.complete();
    } else {
      const next = questions[questionIdx + 1];
      setSelectedOpt(null);
      setQuestionIdx((i) => i + 1);
      if (next) {
        speakEnglish(next.en, 0.94);
      }
    }
  };

  const handleRestartQuiz = () => {
    soundFX.tap();
    setQuizSeed((s) => s + 1);
    setQuestionIdx(0);
    setSelectedOpt(null);
    setQuizCorrectCount(0);
    setQuizFinished(false);
  };

  const allUnitsCompleted =
    units.length > 0 && completedUnitIds.length >= units.length;
  const passedFinalExam = passedCheckpointIds.includes('final-exam');
  const totalWordsCount = units.reduce((acc, u) => acc + u.words.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Practice Hub Header + Sub-Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {formatLabel('مرور هوشمند، بازی و آزمون', 'Practice, Games & Mastery Tests')}
          </h1>
          <p className="text-sm text-slate-400">
            {formatLabel(
              'فلشکارت سه‌بعدی، بازی تطبیق لغات، کوییز سریع، آزمون پایان درس و الفبا',
              'Flip 3D flashcards, play Speed Match, take unit mastery tests, or review A–Z'
            )}
          </p>
        </div>

        {/* 5 Crisp Sub-Tabs */}
        <div
          role="tablist"
          aria-label={formatLabel('بخش‌های تمرین', 'Practice Modes')}
          className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start"
        >
          {(
            [
              {
                id: 'flashcards',
                icon: Layers,
                label: formatLabel('فلشکارت‌ها', 'Flashcards'),
                testId: 'practice-subtab-flashcards',
              },
              {
                id: 'match_game',
                icon: Gamepad2,
                label: formatLabel('بازی تطبیق', 'Match Game'),
                testId: 'practice-subtab-match',
              },
              {
                id: 'quick_quiz',
                icon: Zap,
                label: formatLabel('کوییز سریع', 'Quick Quiz'),
                testId: 'practice-subtab-quiz',
              },
              {
                id: 'tests',
                icon: ClipboardCheck,
                label: formatLabel('آزمون‌ها', 'Mastery Tests'),
                testId: 'practice-subtab-tests',
              },
              {
                id: 'lexicon',
                icon: BookOpen,
                label: formatLabel('واژه‌نامه', 'Word Bank'),
                testId: 'practice-subtab-lexicon',
              },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={t.testId}
                onClick={() => {
                  soundFX.tap();
                  setSubTab(t.id);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Collapsible A-Z Alphabet Strip */}
      <AlphabetMiniStrip uiLang={uiLang} defaultExpanded={false} />

      {/* Sub-Tab 1: 3D Flashcard Decks + Shuffle All */}
      {subTab === 'flashcards' && (
        <div className="space-y-5">
          {onOpenAllFlashcards && (
            <div className="obsidian-surface rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-cyan-400/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
                  <Shuffle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">
                    {formatLabel(
                      `مرور تصادفی کل واژگان (${totalWordsCount} کارت)`,
                      `All-Course Shuffle Deck (${totalWordsCount} Cards)`
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {formatLabel(
                      'همه کلمات دوره را به صورت ترکیبی مرور کنید — با کلیک روی کارت بچرخانید!',
                      'Tap anywhere on a card to flip it and reinforce words across every unit'
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="open-shuffle-deck-btn"
                onClick={() => {
                  soundFX.select();
                  onOpenAllFlashcards();
                }}
                className="cta-emerald px-5 py-2.5 rounded-xl text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{formatLabel('شروع مرور ترکیبی', 'Study Mixed Deck')}</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {units.map((unit) => {
              const masteredInUnit = unit.words.filter((w) =>
                masteredWordIds.includes(w.id)
              ).length;
              const pct = Math.round(
                (masteredInUnit / Math.max(1, unit.words.length)) * 100
              );
              return (
                <div
                  key={unit.unitId}
                  className="obsidian-surface spotlight-surface rounded-3xl p-6 flex flex-col justify-between gap-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${unit.accentGradient} p-[1.5px]`}
                      >
                        <div className="w-full h-full rounded-[14.5px] bg-[#090D16] flex items-center justify-center text-xl">
                          {unit.badgeIcon}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-cyan-300 font-semibold">
                          {formatLabel('یونیت', 'Unit')}{' '}
                          <span className="font-mono-num">{unit.order}</span> ·{' '}
                          {unit.level}
                        </div>
                        <h2 className="text-base font-extrabold text-white">
                          {uiLang === 'en' ? unit.titleEn : unit.titleFa}
                        </h2>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {formatLabel('تسلط بر لغات', 'Words Mastered')}
                        </span>
                        <span className="font-mono-num text-emerald-300 font-bold">
                          {masteredInUnit} / {unit.words.length}
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="w-full h-2 rounded-full bg-slate-900 overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                          style={{ width: `${Math.max(5, pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`open-deck-${unit.unitId}`}
                    onClick={() => {
                      soundFX.select();
                      onOpenFlashcards(unit.unitId);
                    }}
                    className="cta-emerald w-full py-2.5 px-4 rounded-xl text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    <span>{formatLabel('مرور فلشکارت‌ها', 'Study Deck')}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Fun Speed Match Mini-Game */}
      {subTab === 'match_game' && (
        <div className="max-w-3xl mx-auto">
          <div
            data-testid="speed-match-board"
            className="obsidian-surface rounded-3xl p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-emerald-400" />
                  <span>
                    {formatLabel('بازی تطبیق سریع لغات', 'Speed Word Match')}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatLabel(
                    'هر کلمه انگلیسی را با معادل فارسی آن جفت کنید تا +30 XP بگیرید!',
                    'Pair each English word with its Persian meaning to earn +30 XP!'
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleRestartMatchGame(!timedMode)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    timedMode
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {timedMode
                      ? `${secondsLeft}s`
                      : formatLabel('چالش زمان‌دار (۴۵ ثانیه)', '45s Timer Mode')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRestartMatchGame()}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-bold text-cyan-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{formatLabel('دور جدید', 'New Round')}</span>
                </button>
              </div>
            </div>

            {/* Score & Combo Row */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-950/75 border border-slate-800 text-xs">
              <span className="font-mono-num text-slate-300">
                {formatLabel('جفت‌شده:', 'Matched:')}{' '}
                <strong className="text-emerald-300">
                  {matchedIds.length} / {matchPairs.length}
                </strong>
              </span>
              <span className="font-mono-num font-bold text-amber-300">
                {matchCombo >= 2
                  ? `${formatLabel('زنجیره', 'Combo')} ${matchCombo}x 🔥`
                  : formatLabel('آماده جفت‌سازی', 'Pick a pair')}
              </span>
            </div>

            {matchRoundWon ? (
              <div className="py-8 text-center space-y-4">
                <div className="text-4xl">🏆</div>
                <h3 className="text-2xl font-black text-white">
                  {formatLabel('عالی! تمام جفت‌ها را پیدا کردید!', 'Round Cleared! +30 XP Earned!')}
                </h3>
                <button
                  type="button"
                  onClick={() => handleRestartMatchGame()}
                  className="cta-emerald px-6 py-3 rounded-xl text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{formatLabel('بازی مجدد با کلمات جدید', 'Play Another Round')}</span>
                </button>
              </div>
            ) : timedMode && secondsLeft === 0 ? (
              <div className="py-8 text-center space-y-4">
                <div className="text-4xl">⏱️</div>
                <h3 className="text-xl font-black text-amber-200">
                  {formatLabel('زمان این دور به پایان رسید!', "Time's Up!")}
                </h3>
                <button
                  type="button"
                  onClick={() => handleRestartMatchGame()}
                  className="cta-emerald px-6 py-3 rounded-xl text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{formatLabel('تلاش دوباره', 'Try Again')}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* English Column */}
                <div className="space-y-2.5" dir="ltr">
                  {matchPairs.map((pair) => {
                    const isMatched = matchedIds.includes(pair.id);
                    const isSelected = selectedEnId === pair.id;
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        disabled={isMatched}
                        onClick={() => handlePickMatchTile('en', pair.id, pair.en)}
                        className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isMatched
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 opacity-50 cursor-default'
                            : isSelected
                            ? mismatchPair
                              ? 'bg-rose-950/50 border-rose-500 text-rose-200'
                              : 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-white'
                        }`}
                      >
                        <span className="font-en font-bold text-sm">
                          <span className="me-2" aria-hidden="true">
                            {pair.emoji}
                          </span>
                          {pair.en}
                        </span>
                        {isMatched && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Farsi Column */}
                <div className="space-y-2.5" dir="rtl">
                  {shuffledFaMatchPairs.map((pair) => {
                    const isMatched = matchedIds.includes(pair.id);
                    const isSelected = selectedFaId === pair.id;
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        disabled={isMatched}
                        onClick={() => handlePickMatchTile('fa', pair.id)}
                        className={`w-full p-3.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isMatched
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 opacity-50 cursor-default'
                            : isSelected
                            ? mismatchPair
                              ? 'bg-rose-950/50 border-rose-500 text-rose-200'
                              : 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-white'
                        }`}
                      >
                        <span className="font-bold text-sm">{pair.fa}</span>
                        {isMatched && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Rapid 5-Question Quick Review Quiz */}
      {subTab === 'quick_quiz' && activeQuestion && (
        <div className="max-w-2xl mx-auto">
          {quizFinished ? (
            <div className="obsidian-surface rounded-3xl p-8 text-center space-y-5">
              <div className="text-4xl">🎯</div>
              <h2 className="text-2xl font-black text-white">
                {formatLabel('مرور سریع تکمیل شد!', 'Quick Review Complete!')}
              </h2>
              <p className="text-sm text-slate-300">
                {formatLabel(
                  `شما به ${quizCorrectCount} از ${questions.length} واژه پاسخ درست دادید و ${quizCorrectCount * 5} امتیاز XP گرفتید.`,
                  `You answered ${quizCorrectCount} of ${questions.length} correctly and earned +${quizCorrectCount * 5} XP.`
                )}
              </p>
              <button
                type="button"
                onClick={handleRestartQuiz}
                className="cta-emerald px-6 py-3 rounded-xl text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{formatLabel('دور جدید کوییز', 'New Quiz Round')}</span>
              </button>
            </div>
          ) : (
            <div
              data-testid="quick-quiz-card"
              className="obsidian-surface rounded-3xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {formatLabel('پرسش', 'Question')}{' '}
                  <span className="font-mono-num text-cyan-300 font-bold">
                    {questionIdx + 1} / {questions.length}
                  </span>
                </span>
                <span className="font-mono-num text-emerald-400 font-bold">
                  +5 XP / {formatLabel('پاسخ درست', 'Correct')}
                </span>
              </div>

              <div className="text-center space-y-3 py-2">
                <div className="text-4xl" aria-hidden="true">
                  {activeQuestion.emoji}
                </div>
                <h2
                  dir="ltr"
                  className="font-en text-3xl sm:text-4xl font-black text-white"
                >
                  {activeQuestion.en}
                </h2>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => speakEnglish(activeQuestion.en, 0.94)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{formatLabel('شنیدن تلفظ', 'Listen')}</span>
                  </button>
                  <span className="text-xs text-slate-400">
                    «{activeQuestion.phoneticFa}»
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeQuestion.optionsFa.map((opt, idx) => {
                  const chosen = selectedOpt === idx;
                  const isCorrectOpt = idx === activeQuestion.correctIndex;
                  let style =
                    'bg-slate-900/90 border-slate-800 hover:border-cyan-400/50 text-slate-100';
                  if (selectedOpt !== null) {
                    if (isCorrectOpt) {
                      style =
                        'bg-emerald-950/60 border-emerald-400 text-emerald-200';
                    } else if (chosen) {
                      style = 'bg-rose-950/60 border-rose-500 text-rose-200';
                    } else {
                      style = 'bg-slate-900/50 border-slate-800/60 text-slate-500';
                    }
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={selectedOpt !== null}
                      onClick={() => handleAnswerQuiz(idx)}
                      className={`p-4 rounded-2xl border text-sm font-bold transition-colors cursor-pointer flex items-center justify-between ${style}`}
                    >
                      <span>{opt}</span>
                      {selectedOpt !== null && isCorrectOpt && (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      {selectedOpt !== null && chosen && !isCorrectOpt && (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedOpt !== null && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="cta-emerald px-6 py-2.5 rounded-xl text-slate-950 font-extrabold text-sm cursor-pointer"
                  >
                    {questionIdx + 1 >= questions.length
                      ? formatLabel('مشاهده نتیجه', 'See Results')
                      : formatLabel('سؤال بعدی', 'Next Word')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 4: Unit & Final Mastery Checkpoint Tests */}
      {subTab === 'tests' && (
        <div className="space-y-6">
          {/* Course Final Mastery Exam Gate */}
          <div className="obsidian-surface rounded-3xl p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6 border-amber-400/30">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <span>
                    {formatLabel('آزمون جامع کل دوره', 'Final Course Mastery Exam')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {completedUnitIds.length}/{units.length}{' '}
                    {formatLabel('درس تکمیل‌شده', 'Lessons Done')}
                  </span>
                  {passedFinalExam && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">
                        {formatLabel('قبول شد ✓', 'Passed ✓')}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  {allUnitsCompleted
                    ? formatLabel(
                        'تبریک! همه دروس تمام شد — آزمون جامع آماده است',
                        'All Lessons Complete — Final Mastery Exam Ready!'
                      )
                    : formatLabel(
                        'با تکمیل هر درس، آزمون نهایی کل دوره را باز کنید',
                        'Finish Every Lesson to Earn Your Final Course Mastery Test'
                      )}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  {formatLabel(
                    `شامل پرسش‌هایی از تمام ${units.length} یونیت (A1 تا C2) با پاداش +100 XP در صورت قبولی ۷۵٪ به بالا.`,
                    `Covers vocabulary and grammar across all ${units.length} units (A1–C2) with a +100 XP bonus on 75%+ pass.`
                  )}
                </p>
              </div>
            </div>

            {onStartFinalExam && (
              <button
                type="button"
                data-testid="start-final-exam-btn"
                onClick={() => {
                  soundFX.select();
                  onStartFinalExam();
                }}
                className="cta-emerald px-6 py-3 rounded-xl text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trophy className="w-4 h-4" />
                <span>
                  {allUnitsCompleted
                    ? formatLabel('شروع آزمون جامع (+100 XP)', 'Take Final Exam (+100 XP)')
                    : formatLabel('شروع چالش آزمون جامع', 'Challenge Final Exam')}
                </span>
              </button>
            )}
          </div>

          {/* Per-Unit Mastery Checkpoint Tests */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {units.map((unit) => {
              const lessonDone = completedUnitIds.includes(unit.unitId);
              const testPassed = passedCheckpointIds.includes(unit.unitId);

              return (
                <div
                  key={unit.unitId}
                  className="obsidian-surface rounded-3xl p-6 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-cyan-300 font-semibold">
                        {formatLabel('یونیت', 'Unit')}{' '}
                        <span className="font-mono-num">{unit.order}</span> · {unit.level}
                      </span>
                      {testPassed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <Check className="w-3.5 h-3.5" />
                          <span>{formatLabel('قبول شد', 'Passed')}</span>
                        </span>
                      ) : lessonDone ? (
                        <span className="text-xs font-semibold text-amber-300">
                          {formatLabel('آماده آزمون', 'Ready for Test')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {formatLabel('+40 XP قبولی', '+40 XP Pass')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-2xl" aria-hidden="true">
                        {unit.badgeIcon}
                      </span>
                      <h3 className="text-base font-extrabold text-white">
                        {uiLang === 'en' ? unit.titleEn : unit.titleFa}
                      </h3>
                    </div>

                    <p className="text-xs text-slate-400">
                      {formatLabel(
                        '۶ پرسش ترکیبی از واژگان، ترجمه و گرامر این درس',
                        '6 graded questions testing every word & grammar point in this unit'
                      )}
                    </p>
                  </div>

                  {onStartUnitCheckpoint && (
                    <button
                      type="button"
                      data-testid={`unit-test-btn-${unit.unitId}`}
                      onClick={() => {
                        soundFX.select();
                        onStartUnitCheckpoint(unit.unitId);
                      }}
                      className={`w-full py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        testPassed
                          ? 'bg-slate-900 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/30'
                          : 'cta-emerald text-slate-950'
                      }`}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>
                        {testPassed
                          ? formatLabel('آزمون مجدد یونیت', 'Retake Unit Test')
                          : formatLabel('شروع آزمون پایان درس', 'Take Unit Test')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Tab 5: Full Searchable Lexicon */}
      {subTab === 'lexicon' && (
        <div className="-mx-4 sm:-mx-6 -my-8">
          <LexiconView
            units={units}
            masteredWordIds={masteredWordIds}
            onToggleMasteredWord={onToggleMasteredWord}
            uiLang={uiLang}
          />
        </div>
      )}
    </div>
  );
};
