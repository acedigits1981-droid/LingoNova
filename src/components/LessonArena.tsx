import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Heart,
  Volume2,
  Gauge,
  Check,
  AlertCircle,
  RotateCcw,
  Award,
  Flame,
  Lightbulb,
  Mic,
  MicOff,
} from 'lucide-react';
import {
  CurriculumUnit,
  Exercise,
  WordToken,
} from '../types/curriculum';
import {
  buildWordBankTokens,
  calculatePronunciationSimilarity,
  calculateStepXp,
  evaluateExerciseAnswer,
  expandContractions,
} from '../utils/lessonEngine';
import {
  soundFX,
  speakEnglish,
  startEnglishSpeechRecognition,
} from '../utils/soundEngine';
import { triggerParticleBurst } from './ParticleCanvas';
import { UiLanguageMode } from './PronunciationLabView';

interface LessonArenaProps {
  unit: CurriculumUnit;
  onExit: () => void;
  onLessonCompleted: (stats: {
    unitId: string;
    earnedXp: number;
    accuracy: number;
    durationSec: number;
    perfect: boolean;
  }) => void;
  onStartUnitCheckpoint?: (unitId: string) => void;
  uiLang?: UiLanguageMode;
}

export const LessonArena: React.FC<LessonArenaProps> = ({
  unit,
  onExit,
  onLessonCompleted,
  onStartUnitCheckpoint,
  uiLang = 'fa',
}) => {
  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);
  const [stepIndex, setStepIndex] = useState(0);
  const [hearts, setHearts] = useState(5);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [feedbackAnswer, setFeedbackAnswer] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showCompleteScreen, setShowCompleteScreen] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  // Word bank & listening state
  const [bankTokens, setBankTokens] = useState<WordToken[]>([]);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);

  // Multiple choice state
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);

  // Fill blank state
  const [selectedBlankOption, setSelectedBlankOption] = useState<string | null>(null);

  // Matching pairs state
  const [selectedEnPairId, setSelectedEnPairId] = useState<string | null>(null);
  const [selectedFaPairId, setSelectedFaPairId] = useState<string | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [mismatchPairFlash, setMismatchPairFlash] = useState(false);

  // Web Speech Recognition state for pronunciation & voice answers
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false);
  const [micErrorMsg, setMicErrorMsg] = useState<string | null>(null);
  const [pronunciationScore, setPronunciationScore] = useState<number | null>(
    null
  );
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const exercises: Exercise[] = unit.exercises;
  const currentExercise = exercises[stepIndex] ?? exercises[0];
  const totalSteps = exercises.length;

  // Shuffled Persian column for matching_pairs so it isn't always 1:1 aligned
  const shuffledFaPairs = useMemo(() => {
    if (currentExercise.type !== 'matching_pairs') return [];
    const copy = [...currentExercise.pairs];
    // Deterministic swap based on index so pairs are offset
    return copy.reverse();
  }, [currentExercise]);

  // Initialize exercise state on step change
  useEffect(() => {
    recognitionRef.current?.stop();
    setStatus('idle');
    setFeedbackAnswer('');
    setSelectedTokenIds([]);
    setSelectedChoiceIndex(null);
    setSelectedBlankOption(null);
    setSelectedEnPairId(null);
    setSelectedFaPairId(null);
    setMatchedPairIds([]);
    setSpokenTranscript('');
    setIsRecordingSpeech(false);
    setMicErrorMsg(null);
    setPronunciationScore(null);

    if (
      currentExercise.type === 'word_bank' ||
      currentExercise.type === 'listening'
    ) {
      setBankTokens(buildWordBankTokens(currentExercise, false));
    } else {
      setBankTokens([]);
    }

    if (currentExercise.type === 'listening') {
      const timer = setTimeout(() => {
        speakEnglish(
          currentExercise.audioTextEn,
          0.92,
          () => setIsPlayingAudio(true),
          () => setIsPlayingAudio(false)
        );
      }, 240);
      return () => clearTimeout(timer);
    }

    if (currentExercise.type === 'speaking') {
      const timer = setTimeout(() => {
        speakEnglish(
          currentExercise.targetPhraseEn,
          0.94,
          () => setIsPlayingAudio(true),
          () => setIsPlayingAudio(false)
        );
      }, 240);
      return () => clearTimeout(timer);
    }
  }, [stepIndex, currentExercise]);

  const handleToggleToken = (tokenId: string) => {
    if (status !== 'idle') return;
    setSelectedTokenIds((prev) => {
      const pos = prev.indexOf(tokenId);
      if (pos > -1) {
        soundFX.tap();
        return prev.filter((id) => id !== tokenId);
      } else {
        soundFX.select();
        const tok = bankTokens.find((t) => t.id === tokenId);
        if (tok) speakEnglish(tok.text, 1.02);
        return [...prev, tokenId];
      }
    });
  };

  const handleSelectChoice = (idx: number) => {
    if (status !== 'idle' || currentExercise.type !== 'multiple_choice') return;
    soundFX.select();
    setSelectedChoiceIndex(idx);
    const optText = currentExercise.optionsEn[idx];
    if (optText && /^[A-Za-z]/.test(optText)) {
      speakEnglish(optText, 0.98);
    }
  };

  const handleSelectBlank = (opt: string) => {
    if (status !== 'idle' || currentExercise.type !== 'fill_blank') return;
    soundFX.select();
    setSelectedBlankOption(opt);
    speakEnglish(opt, 1.0);
  };

  const handlePairClick = (side: 'en' | 'fa', pairId: string, enText: string) => {
    if (status !== 'idle' || matchedPairIds.includes(pairId)) return;

    if (side === 'en') {
      soundFX.select();
      speakEnglish(enText, 1.0);
      const nextEn = selectedEnPairId === pairId ? null : pairId;
      setSelectedEnPairId(nextEn);

      if (nextEn && selectedFaPairId) {
        if (nextEn === selectedFaPairId) {
          soundFX.match();
          const updated = [...matchedPairIds, nextEn];
          setMatchedPairIds(updated);
          setSelectedEnPairId(null);
          setSelectedFaPairId(null);
        } else {
          soundFX.error();
          setMismatchPairFlash(true);
          setTimeout(() => {
            setMismatchPairFlash(false);
            setSelectedEnPairId(null);
            setSelectedFaPairId(null);
          }, 420);
        }
      }
    } else {
      soundFX.tap();
      const nextFa = selectedFaPairId === pairId ? null : pairId;
      setSelectedFaPairId(nextFa);

      if (selectedEnPairId && nextFa) {
        if (selectedEnPairId === nextFa) {
          soundFX.match();
          const updated = [...matchedPairIds, nextFa];
          setMatchedPairIds(updated);
          setSelectedEnPairId(null);
          setSelectedFaPairId(null);
        } else {
          soundFX.error();
          setMismatchPairFlash(true);
          setTimeout(() => {
            setMismatchPairFlash(false);
            setSelectedEnPairId(null);
            setSelectedFaPairId(null);
          }, 420);
        }
      }
    }
  };

  const mapSpokenWordsToBankTokens = useCallback(
    (transcript: string) => {
      const spokenWords = expandContractions(transcript)
        .split(' ')
        .filter(Boolean);
      if (spokenWords.length === 0) return;

      const usedIds: string[] = [];
      for (const sw of spokenWords) {
        const match = bankTokens.find(
          (tok) =>
            !usedIds.includes(tok.id) &&
            expandContractions(tok.text) === sw
        );
        if (match) {
          usedIds.push(match.id);
        }
      }
      if (usedIds.length > 0) {
        setSelectedTokenIds(usedIds);
      }
    },
    [bankTokens]
  );

  const handleToggleSpeechRecognition = (
    expectedPhrase: string,
    autoMapToWordBank = false
  ) => {
    if (status !== 'idle') return;

    if (isRecordingSpeech) {
      recognitionRef.current?.stop();
      setIsRecordingSpeech(false);
      return;
    }

    setMicErrorMsg(null);
    recognitionRef.current = startEnglishSpeechRecognition({
      expectedPhraseEn: expectedPhrase,
      onStart: () => {
        setIsRecordingSpeech(true);
      },
      onInterim: (interimText) => {
        setSpokenTranscript(interimText);
        if (currentExercise.type === 'speaking') {
          const sim = calculatePronunciationSimilarity(
            currentExercise.targetPhraseEn,
            interimText
          );
          setPronunciationScore(sim.score);
        }
        if (autoMapToWordBank) {
          mapSpokenWordsToBankTokens(interimText);
        }
      },
      onResult: (finalText) => {
        setSpokenTranscript(finalText);
        if (currentExercise.type === 'speaking') {
          const sim = calculatePronunciationSimilarity(
            currentExercise.targetPhraseEn,
            finalText
          );
          setPronunciationScore(sim.score);
        }
        if (autoMapToWordBank) {
          mapSpokenWordsToBankTokens(finalText);
        }
        soundFX.match();
      },
      onError: (_code, msgFa) => {
        setMicErrorMsg(msgFa);
      },
      onEnd: () => {
        setIsRecordingSpeech(false);
      },
    });
  };

  const canSubmit = useMemo(() => {
    if (status !== 'idle') return false;
    switch (currentExercise.type) {
      case 'word_bank':
      case 'listening':
        return selectedTokenIds.length > 0;
      case 'multiple_choice':
        return selectedChoiceIndex !== null;
      case 'fill_blank':
        return selectedBlankOption !== null;
      case 'matching_pairs':
        return matchedPairIds.length === currentExercise.pairs.length;
      case 'speaking':
        return spokenTranscript.trim().length > 0;
    }
  }, [
    status,
    currentExercise,
    selectedTokenIds.length,
    selectedChoiceIndex,
    selectedBlankOption,
    matchedPairIds.length,
    spokenTranscript,
  ]);

  const handleCheckAnswer = useCallback(() => {
    if (!canSubmit) return;

    const selectedTexts = selectedTokenIds.map(
      (id) => bankTokens.find((t) => t.id === id)?.text ?? ''
    );

    const evaluation = evaluateExerciseAnswer(currentExercise, {
      selectedTokens: selectedTexts,
      selectedChoiceIndex: selectedChoiceIndex ?? undefined,
      matchedPairIds,
      selectedBlankOption: selectedBlankOption ?? undefined,
      spokenTranscript,
    });

    setFeedbackAnswer(evaluation.correctAnswerDisplay);
    if (typeof evaluation.pronunciationScore === 'number') {
      setPronunciationScore(evaluation.pronunciationScore);
    }

    if (evaluation.isCorrect) {
      const nextCombo = combo + 1;
      const { stepXp } = calculateStepXp(15, nextCombo);
      setStatus('correct');
      setCombo(nextCombo);
      setCorrectCount((c) => c + 1);
      setEarnedXp((xp) => xp + stepXp);
      soundFX.success();

      if (evaluation.spokenPhrase && /^[A-Za-z]/.test(evaluation.spokenPhrase)) {
        setTimeout(() => speakEnglish(evaluation.spokenPhrase, 0.96), 220);
      }

      if (submitBtnRef.current) {
        const rect = submitBtnRef.current.getBoundingClientRect();
        triggerParticleBurst(rect.left + rect.width / 2, rect.top, 34);
      }
    } else {
      setStatus('wrong');
      setCombo(0);
      setHearts((h) => Math.max(0, h - 1));
      soundFX.error();
    }
  }, [
    canSubmit,
    selectedTokenIds,
    bankTokens,
    currentExercise,
    selectedChoiceIndex,
    matchedPairIds,
    selectedBlankOption,
    spokenTranscript,
    combo,
  ]);

  const handleRestartLesson = () => {
    soundFX.tap();
    startTimeRef.current = Date.now();
    setStepIndex(0);
    setHearts(5);
    setCombo(0);
    setCorrectCount(0);
    setEarnedXp(0);
    setShowCompleteScreen(false);
    setStatus('idle');
  };

  const handleNextStep = useCallback(() => {
    soundFX.tap();
    if (hearts <= 0) {
      handleRestartLesson();
      return;
    }

    if (stepIndex + 1 < totalSteps) {
      setStepIndex((idx) => idx + 1);
    } else {
      const elapsed = Math.max(
        1,
        Math.round((Date.now() - startTimeRef.current) / 1000)
      );
      setDurationSec(elapsed);
      const totalEarned = earnedXp + unit.xpReward;
      setEarnedXp(totalEarned);
      setShowCompleteScreen(true);
      soundFX.complete();
      setTimeout(() => {
        triggerParticleBurst(
          window.innerWidth * 0.5,
          window.innerHeight * 0.35,
          60
        );
      }, 120);
      const accuracy = Math.round((correctCount / totalSteps) * 100);
      onLessonCompleted({
        unitId: unit.unitId,
        earnedXp: totalEarned,
        accuracy,
        durationSec: elapsed,
        perfect: correctCount === totalSteps,
      });
    }
  }, [
    hearts,
    stepIndex,
    totalSteps,
    earnedXp,
    unit.xpReward,
    unit.unitId,
    correctCount,
    onLessonCompleted,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showCompleteScreen) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (status === 'idle' && canSubmit) {
          handleCheckAnswer();
        } else if (status !== 'idle') {
          handleNextStep();
        }
      } else if (
        status === 'idle' &&
        currentExercise.type === 'multiple_choice'
      ) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= currentExercise.optionsEn.length) {
          handleSelectChoice(num - 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showCompleteScreen,
    status,
    canSubmit,
    handleCheckAnswer,
    handleNextStep,
    currentExercise,
  ]);

  if (showCompleteScreen) {
    const accuracy = Math.round((correctCount / totalSteps) * 100);
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="obsidian-surface spotlight-surface rounded-3xl p-8 sm:p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
            <Award className="w-8 h-8" />
          </div>

          <p className="text-xs font-mono-num text-cyan-300 mb-1">
            {uiLang === 'en' ? unit.titleEn : unit.titleFa} · {formatLabel('تکمیل شد', 'Completed')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {formatLabel('آفرین! درس را با موفقیت گذراندید', 'Awesome! Lesson Complete')}
          </h1>
          <p className="text-sm text-slate-400 mb-8">
            {formatLabel(
              `یونیت «${unit.titleFa}» ثبت شد و امتیاز تجربه به پروفایل شما اضافه گردید.`,
              `Unit "${unit.titleEn}" has been recorded and XP was added to your streak.`
            )}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8 py-4 border-y border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('امتیاز دریافتی', 'XP Earned')}
              </div>
              <div className="font-mono-num text-xl font-bold text-emerald-400">
                +{earnedXp} XP
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('دقت پاسخگویی', 'Accuracy')}
              </div>
              <div className="font-mono-num text-xl font-bold text-cyan-300">
                {accuracy}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('زمان سپریشده', 'Time Spent')}
              </div>
              <div className="font-mono-num text-xl font-bold text-slate-200">
                {durationSec}s
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {onStartUnitCheckpoint && (
              <button
                type="button"
                data-testid="lesson-complete-unit-test-btn"
                onClick={() => {
                  soundFX.select();
                  onStartUnitCheckpoint(unit.unitId);
                }}
                className="cta-emerald flex-1 py-3.5 px-6 rounded-xl text-slate-950 font-extrabold text-sm cursor-pointer"
              >
                {formatLabel('آزمون پایان این درس (+40 XP)', 'Take Unit Test (+40 XP)')}
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className={`py-3.5 px-6 rounded-xl font-extrabold text-sm cursor-pointer ${
                onStartUnitCheckpoint
                  ? 'bg-slate-900 border border-slate-800 text-slate-100 hover:border-cyan-400/50'
                  : 'cta-emerald flex-1 text-slate-950'
              }`}
            >
              {formatLabel('بازگشت به مسیر یادگیری', 'Back to Learning Path')}
            </button>
            <button
              type="button"
              onClick={handleRestartLesson}
              className="px-5 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{formatLabel('تمرین مجدد', 'Practice Again')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(
    ((stepIndex + (status === 'correct' ? 1 : 0)) / totalSteps) * 100
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 min-h-[calc(100vh-4rem)] flex flex-col justify-between">
      {/* Top Lesson HUD */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="خروج از درس"
          onClick={() => {
            soundFX.tap();
            onExit();
          }}
          className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Segmented Progress Track */}
        <div className="flex-1">
          <div className="w-full h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-transform duration-300 origin-right"
              style={{ width: `${Math.max(8, progressPct)}%` }}
            />
          </div>
        </div>

        {/* Energy Shields (Hearts) */}
        <div
          className="flex items-center gap-1.5 text-xs font-mono-num font-bold text-rose-400 shrink-0"
          aria-label={`${hearts} سپر انرژی باقی مانده`}
        >
          <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
          <span>{hearts}</span>
        </div>
      </div>

      {/* Main Exercise Stage */}
      <div className="my-auto py-8">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>
            {uiLang === 'en' ? unit.titleEn : unit.titleFa} ·{' '}
            {formatLabel('گام', 'Step')} {stepIndex + 1}{' '}
            {formatLabel('از', 'of')} {totalSteps}
          </span>
          {combo >= 2 && (
            <span className="inline-flex items-center gap-1 font-mono-num font-bold text-amber-300">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {formatLabel('زنجیره', 'Streak')} {combo}x
              </span>
            </span>
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-6">
          {currentExercise.promptFa}
        </h2>

        {/* 1. WORD BANK & LISTENING */}
        {(currentExercise.type === 'word_bank' ||
          currentExercise.type === 'listening') && (
          <div>
            {currentExercise.type === 'listening' ? (
              <div className="obsidian-surface rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    aria-label="پخش تلفظ جمله"
                    onClick={() =>
                      speakEnglish(
                        currentExercise.audioTextEn,
                        0.92,
                        () => setIsPlayingAudio(true),
                        () => setIsPlayingAudio(false)
                      )
                    }
                    className="cta-emerald w-12 h-12 rounded-xl flex items-center justify-center text-slate-950 shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                  <div>
                    <div className="text-sm font-bold text-white">
                      پخش صوتی جمله انگلیسی
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      راهنمایی معنایی: «{currentExercise.meaningFa}»
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-end gap-1 h-7 ${
                      isPlayingAudio ? 'eq-playing' : ''
                    }`}
                    aria-hidden="true"
                  >
                    {[14, 24, 12, 26, 18, 24, 14, 20].map((h, i) => (
                      <div
                        key={i}
                        className="eq-bar"
                        style={{
                          height: `${h}px`,
                          animationDelay: `${i * 0.08}s`,
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      speakEnglish(
                        currentExercise.audioTextEn,
                        0.68,
                        () => setIsPlayingAudio(true),
                        () => setIsPlayingAudio(false)
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Gauge className="w-4 h-4" />
                    <span>پخش آهسته</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="obsidian-surface rounded-2xl px-6 py-5 mb-6 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">جمله مبدأ (فارسی)</div>
                  <div className="text-lg sm:text-xl font-extrabold text-white">
                    {currentExercise.sourceFa}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label="پاسخ صوتی با میکروفون"
                    disabled={status !== 'idle'}
                    onClick={() =>
                      handleToggleSpeechRecognition(
                        currentExercise.targetEn.join(' '),
                        true
                      )
                    }
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      isRecordingSpeech
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-slate-900 border-slate-800 hover:border-emerald-400/50 text-emerald-300'
                    }`}
                  >
                    {isRecordingSpeech ? (
                      <>
                        <MicOff className="w-4 h-4 text-rose-400" />
                        <span>در حال شنیدن...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-emerald-400" />
                        <span>پاسخ صوتی</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="شنیدن تلفظ انگلیسی"
                    onClick={() =>
                      speakEnglish(currentExercise.targetEn.join(' '), 0.92)
                    }
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/40 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    <span>راهنمای صوتی</span>
                  </button>
                </div>
              </div>
            )}

            {/* Answer Construction Slot (Strictly LTR) */}
            <div
              dir="ltr"
              data-testid="answer-construction-slot"
              className={`min-h-[84px] obsidian-surface rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-2.5 transition-colors ${
                status === 'correct'
                  ? 'border-emerald-400/70 bg-emerald-950/20'
                  : status === 'wrong'
                  ? 'border-rose-500/70 bg-rose-950/20 animate-shake-error'
                  : ''
              }`}
            >
              {selectedTokenIds.length === 0 ? (
                <span
                  dir="rtl"
                  className="text-sm text-slate-500 w-full text-center select-none"
                >
                  کلمات انگلیسی زیر را به ترتیب صحیح انتخاب کنید...
                </span>
              ) : (
                selectedTokenIds.map((id) => {
                  const tok = bankTokens.find((t) => t.id === id);
                  if (!tok) return null;
                  return (
                    <button
                      key={tok.id}
                      type="button"
                      disabled={status !== 'idle'}
                      onClick={() => handleToggleToken(tok.id)}
                      className="word-token-btn px-4 py-2.5 rounded-xl font-en font-bold text-sm sm:text-base text-white cursor-pointer"
                    >
                      {tok.text}
                    </button>
                  );
                })
              )}
            </div>

            {/* Available Word Bank (Strictly LTR) */}
            <div
              dir="ltr"
              data-testid="word-bank-dock"
              className="flex flex-wrap items-center justify-center gap-2.5 py-2"
            >
              {bankTokens.map((tok) => {
                const isSelected = selectedTokenIds.includes(tok.id);
                if (isSelected) {
                  return (
                    <div
                      key={tok.id}
                      aria-hidden="true"
                      className="px-4 py-2.5 rounded-xl font-en font-bold text-sm sm:text-base text-transparent bg-slate-900/40 border border-dashed border-slate-800 select-none"
                    >
                      {tok.text}
                    </div>
                  );
                }
                return (
                  <button
                    key={tok.id}
                    type="button"
                    disabled={status !== 'idle'}
                    onClick={() => handleToggleToken(tok.id)}
                    className="word-token-btn px-4 py-2.5 rounded-xl font-en font-bold text-sm sm:text-base text-slate-100 cursor-pointer"
                  >
                    {tok.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. MULTIPLE CHOICE */}
        {currentExercise.type === 'multiple_choice' && (
          <div>
            <div className="obsidian-surface rounded-2xl px-6 py-5 mb-6">
              <div className="text-xs text-slate-400 mb-1">عبارت مورد نظر</div>
              <div className="text-lg sm:text-xl font-extrabold text-white">
                {currentExercise.sourceFa}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {currentExercise.optionsEn.map((opt, idx) => {
                const isSelected = selectedChoiceIndex === idx;
                const isEnglishOption = /^[A-Za-z]/.test(opt);
                let borderStyle = 'border-slate-800 hover:border-cyan-400/50';
                if (status === 'idle' && isSelected) {
                  borderStyle = 'border-cyan-400 bg-cyan-500/10';
                } else if (status !== 'idle') {
                  if (idx === currentExercise.correctIndex) {
                    borderStyle = 'border-emerald-400 bg-emerald-500/15';
                  } else if (isSelected) {
                    borderStyle = 'border-rose-500 bg-rose-500/15 animate-shake-error';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={status !== 'idle'}
                    dir={isEnglishOption ? 'ltr' : 'rtl'}
                    onClick={() => handleSelectChoice(idx)}
                    className={`obsidian-surface p-4 sm:p-5 rounded-2xl border ${borderStyle} flex items-center justify-between gap-3 transition-colors cursor-pointer text-start`}
                  >
                    <span
                      className={`font-bold text-base ${
                        isEnglishOption ? 'font-en' : 'font-fa'
                      } text-white`}
                    >
                      {opt}
                    </span>
                    <span className="font-mono-num text-xs text-slate-400 shrink-0">
                      [{idx + 1}]
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. FILL IN THE BLANK */}
        {currentExercise.type === 'fill_blank' && (
          <div>
            <div className="obsidian-surface rounded-2xl p-6 mb-6 space-y-4">
              <div>
                <div className="text-xs text-slate-400 mb-1">معنای فارسی</div>
                <div className="text-lg font-bold text-white">
                  {currentExercise.sourceFa}
                </div>
              </div>

              <div
                dir="ltr"
                className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2 font-en text-xl sm:text-2xl font-extrabold text-white"
              >
                {currentExercise.sentenceBeforeEn && (
                  <span>{currentExercise.sentenceBeforeEn}</span>
                )}
                <span
                  className={`inline-flex items-center justify-center min-w-[96px] px-4 py-1.5 rounded-xl border-b-2 text-center ${
                    selectedBlankOption
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-slate-500'
                  }`}
                >
                  {selectedBlankOption ?? '____'}
                </span>
                {currentExercise.sentenceAfterEn && (
                  <span>{currentExercise.sentenceAfterEn}</span>
                )}
              </div>
            </div>

            <div
              dir="ltr"
              className="flex flex-wrap items-center justify-center gap-3"
            >
              {currentExercise.optionsEn.map((opt) => {
                const isSelected = selectedBlankOption === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={status !== 'idle'}
                    onClick={() => handleSelectBlank(opt)}
                    className={`word-token-btn px-5 py-3 rounded-xl font-en font-bold text-base cursor-pointer ${
                      isSelected
                        ? 'border-cyan-400 text-cyan-300 bg-cyan-950/40'
                        : 'text-white'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. MATCHING PAIRS */}
        {currentExercise.type === 'matching_pairs' && (
          <div className="grid grid-cols-2 gap-4">
            {/* Left/Right Column 1: Persian */}
            <div className="space-y-3">
              <div className="text-xs text-slate-400 mb-2">معادل فارسی</div>
              {shuffledFaPairs.map((pair) => {
                const isMatched = matchedPairIds.includes(pair.id);
                const isSelected = selectedFaPairId === pair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    disabled={isMatched || status !== 'idle'}
                    onClick={() => handlePairClick('fa', pair.id, pair.en)}
                    className={`w-full p-4 rounded-2xl border text-right transition-colors cursor-pointer flex items-center justify-between ${
                      isMatched
                        ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300 opacity-55 cursor-default'
                        : isSelected
                        ? mismatchPairFlash
                          ? 'bg-rose-950/40 border-rose-500 text-rose-200 animate-shake-error'
                          : 'bg-cyan-950/40 border-cyan-400 text-cyan-200'
                        : 'obsidian-surface border-slate-800 hover:border-slate-700 text-white'
                    }`}
                  >
                    <span className="font-bold text-sm sm:text-base">{pair.fa}</span>
                    {isMatched && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Column 2: English */}
            <div className="space-y-3" dir="ltr">
              <div className="text-xs text-slate-400 mb-2 text-left">English Word</div>
              {currentExercise.pairs.map((pair) => {
                const isMatched = matchedPairIds.includes(pair.id);
                const isSelected = selectedEnPairId === pair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    disabled={isMatched || status !== 'idle'}
                    onClick={() => handlePairClick('en', pair.id, pair.en)}
                    className={`w-full p-4 rounded-2xl border text-left transition-colors cursor-pointer flex items-center justify-between ${
                      isMatched
                        ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300 opacity-55 cursor-default'
                        : isSelected
                        ? mismatchPairFlash
                          ? 'bg-rose-950/40 border-rose-500 text-rose-200 animate-shake-error'
                          : 'bg-cyan-950/40 border-cyan-400 text-cyan-200'
                        : 'obsidian-surface border-slate-800 hover:border-slate-700 text-white'
                    }`}
                  >
                    <span className="font-en font-bold text-sm sm:text-base">
                      {pair.en}
                    </span>
                    <span className="text-xs text-slate-400 font-fa" dir="rtl">
                      {pair.phoneticFa}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. SPEAKING & PRONUNCIATION (Web Speech Recognition API) */}
        {currentExercise.type === 'speaking' && (
          <div className="space-y-5">
            {/* Target Phrase & Phonetic Card */}
            <div className="obsidian-surface rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    معنای فارسی: {currentExercise.sourceFa}
                  </div>
                  <div className="text-xs text-cyan-300 font-semibold">
                    تلفظ فارسی: «{currentExercise.phoneticFa}»
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      speakEnglish(
                        currentExercise.targetPhraseEn,
                        0.95,
                        () => setIsPlayingAudio(true),
                        () => setIsPlayingAudio(false)
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>تلفظ طبیعی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      speakEnglish(
                        currentExercise.targetPhraseEn,
                        0.68,
                        () => setIsPlayingAudio(true),
                        () => setIsPlayingAudio(false)
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Gauge className="w-4 h-4 text-emerald-400" />
                    <span>تلفظ آهسته</span>
                  </button>
                </div>
              </div>

              {/* Word-by-word Interactive Phrase */}
              <div
                dir="ltr"
                data-testid="speaking-target-phrase"
                className="py-4 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-2 font-en text-2xl sm:text-3xl font-extrabold"
              >
                {(() => {
                  const targetWords = currentExercise.targetPhraseEn.split(' ');
                  const liveEval = spokenTranscript.trim()
                    ? calculatePronunciationSimilarity(
                        currentExercise.targetPhraseEn,
                        spokenTranscript
                      )
                    : null;

                  return targetWords.map((word, idx) => {
                    const matched = liveEval?.matchedWords[idx];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => speakEnglish(word, 0.92)}
                        title="کلیک برای شنیدن تلفظ کلمه"
                        className={`px-2.5 py-1 rounded-xl transition-colors cursor-pointer ${
                          matched === true
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                            : matched === false
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-400/30'
                            : 'text-white hover:bg-slate-800/70'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Web Speech Recognition Microphone Stage */}
            <div className="obsidian-surface rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={status !== 'idle'}
                  onClick={() =>
                    handleToggleSpeechRecognition(
                      currentExercise.targetPhraseEn,
                      false
                    )
                  }
                  className={`px-6 py-3.5 rounded-2xl font-extrabold text-sm inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer transition-transform ${
                    isRecordingSpeech
                      ? 'bg-rose-500 text-white'
                      : 'cta-emerald text-slate-950'
                  }`}
                >
                  {isRecordingSpeech ? (
                    <>
                      <MicOff className="w-5 h-5" />
                      <span>در حال گوش دادن به صدای شما... (توقف)</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      <span>شروع تلفظ با میکروفون</span>
                    </>
                  )}
                </button>

                {isRecordingSpeech && (
                  <div
                    className="flex items-end gap-1 h-7 eq-playing"
                    aria-hidden="true"
                  >
                    {[14, 26, 16, 28, 18, 24].map((h, i) => (
                      <div
                        key={i}
                        className="eq-bar"
                        style={{
                          height: `${h}px`,
                          animationDelay: `${i * 0.08}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {micErrorMsg && (
                <div className="w-full max-w-lg px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
                  {micErrorMsg}
                </div>
              )}

              {/* Recognized Speech Transcript & Accuracy Readout */}
              <div className="w-full max-w-lg space-y-2 text-right">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <label htmlFor="lesson-speech-transcript">
                    جمله تشخیص دادهشده توسط مرورگر (یا ویرایش دستی):
                  </label>
                  {pronunciationScore !== null && (
                    <span
                      className={`font-bold ${
                        pronunciationScore >= 70
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }`}
                    >
                      دقت تلفظ:{' '}
                      <span className="font-mono-num">{pronunciationScore}%</span>
                    </span>
                  )}
                </div>
                <input
                  id="lesson-speech-transcript"
                  dir="ltr"
                  type="text"
                  disabled={status !== 'idle'}
                  value={spokenTranscript}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSpokenTranscript(val);
                    const sim = calculatePronunciationSimilarity(
                      currentExercise.targetPhraseEn,
                      val
                    );
                    setPronunciationScore(val.trim() ? sim.score : null);
                  }}
                  placeholder={currentExercise.targetPhraseEn}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 font-en text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action & Pedagogical Grammar Drawer */}
      <div className="pt-4 border-t border-slate-800/80">
        {status === 'idle' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {currentExercise.type === 'speaking' ? (
              <button
                type="button"
                data-testid="cant-speak-now-btn"
                onClick={() => {
                  recognitionRef.current?.stop();
                  handleNextStep();
                }}
                className="px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {formatLabel('الان نمی‌توانم صحبت کنم (رد شدن)', "Can't speak right now")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  soundFX.tap();
                  const res = evaluateExerciseAnswer(currentExercise, {});
                  setFeedbackAnswer(res.correctAnswerDisplay);
                  setStatus('wrong');
                  setCombo(0);
                }}
                className="px-5 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {formatLabel('رد کردن این سؤال', 'Skip')}
              </button>
            )}

            <button
              ref={submitBtnRef}
              type="button"
              disabled={!canSubmit}
              onClick={handleCheckAnswer}
              className="cta-emerald flex-1 py-3.5 px-6 rounded-xl text-slate-950 font-extrabold text-base whitespace-nowrap cursor-pointer"
            >
              {formatLabel('بررسی پاسخ', 'Check Answer')}
            </button>
          </div>
        ) : status === 'correct' ? (
          <div className="obsidian-surface border-emerald-500/40 bg-emerald-950/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-300 font-extrabold text-base">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{formatLabel('پاسخ شما کاملاً درست است!', 'Excellent! Correct answer!')}</span>
              </div>
              <div className="flex items-start gap-2 text-xs sm:text-sm text-slate-200 leading-relaxed">
                <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>{currentExercise.grammarTipFa}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextStep}
              className="cta-emerald px-7 py-3 rounded-xl text-slate-950 font-extrabold text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              {formatLabel('ادامه', 'Continue')}
            </button>
          </div>
        ) : (
          <div className="obsidian-surface border-rose-500/40 bg-rose-950/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-rose-300 font-extrabold text-base">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>
                  {hearts <= 0
                    ? formatLabel('سپر انرژی شما به پایان رسید!', 'Out of Energy Hearts!')
                    : formatLabel('نیاز به دقت بیشتر — پاسخ صحیح:', 'Correct Answer:')}
                </span>
              </div>
              <div
                dir="ltr"
                className="font-en font-bold text-sm text-white bg-slate-950/70 inline-block px-3 py-1 rounded-lg border border-slate-800"
              >
                {feedbackAnswer}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {currentExercise.grammarTipFa}
              </p>
            </div>

            <button
              type="button"
              onClick={handleNextStep}
              className="bg-rose-500 hover:bg-rose-400 text-white font-extrabold px-6 py-3 rounded-xl text-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {hearts <= 0
                ? formatLabel('شروع مجدد درس', 'Restart Lesson')
                : formatLabel('متوجه شدم', 'Got It')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
