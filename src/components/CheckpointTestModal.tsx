import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Volume2,
  Check,
  AlertCircle,
  Trophy,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { CurriculumUnit } from '../types/curriculum';
import {
  buildCourseFinalTestQuestions,
  buildUnitCheckpointQuestions,
  CheckpointQuestion,
  gradeCheckpointTest,
} from '../utils/lessonEngine';
import { soundFX, speakEnglish } from '../utils/soundEngine';
import { triggerConfettiCelebration } from './ParticleCanvas';
import { UiLanguageMode } from './PronunciationLabView';

interface CheckpointTestModalProps {
  mode: 'unit' | 'final';
  unit?: CurriculumUnit;
  units: CurriculumUnit[];
  onClose: () => void;
  onTestCompleted: (result: {
    checkpointId: string;
    passed: boolean;
    earnedXp: number;
    percentage: number;
  }) => void;
  uiLang?: UiLanguageMode;
}

export const CheckpointTestModal: React.FC<CheckpointTestModalProps> = ({
  mode,
  unit,
  units,
  onClose,
  onTestCompleted,
  uiLang = 'fa',
}) => {
  const [seed, setSeed] = useState(0);
  const [index, setIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [stepChecked, setStepChecked] = useState(false);
  const [finished, setFinished] = useState(false);

  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);

  const checkpointId = mode === 'final' ? 'final-exam' : unit?.unitId ?? 'unit-1';
  const xpReward = mode === 'final' ? 100 : 40;

  const questions: CheckpointQuestion[] = useMemo(() => {
    if (mode === 'final') {
      return buildCourseFinalTestQuestions(units, seed);
    }
    const targetUnit = unit ?? units[0];
    return buildUnitCheckpointQuestions(targetUnit, units, seed);
  }, [mode, unit, units, seed]);

  const currentQuestion = questions[index] ?? questions[0];
  const total = questions.length;
  const chosenOption = currentQuestion ? selectedAnswers[currentQuestion.id] : undefined;

  useEffect(() => {
    if (!finished && currentQuestion?.audioTextEn && currentQuestion.kind === 'meaning') {
      const t = setTimeout(() => {
        speakEnglish(currentQuestion.audioTextEn!, 0.94);
      }, 180);
      return () => clearTimeout(t);
    }
  }, [index, finished, currentQuestion]);

  const handleSelectOption = (optIdx: number) => {
    if (!currentQuestion || stepChecked) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentQuestion.id]: optIdx }));
    setStepChecked(true);
    if (optIdx === currentQuestion.correctIndex) {
      soundFX.success();
    } else {
      soundFX.error();
    }
  };

  const handleAdvance = () => {
    soundFX.tap();
    if (index + 1 < total) {
      setStepChecked(false);
      setIndex((i) => i + 1);
    } else {
      const grade = gradeCheckpointTest(questions, selectedAnswers, xpReward);
      setFinished(true);
      if (grade.passed) {
        soundFX.complete();
        setTimeout(() => {
          triggerConfettiCelebration(
            window.innerWidth * 0.5,
            window.innerHeight * 0.35,
            90
          );
        }, 120);
      }
      onTestCompleted({
        checkpointId,
        passed: grade.passed,
        earnedXp: grade.earnedXp,
        percentage: grade.percentage,
      });
    }
  };

  const handleRetake = () => {
    soundFX.tap();
    setSeed((s) => s + 1);
    setIndex(0);
    setSelectedAnswers({});
    setStepChecked(false);
    setFinished(false);
  };

  if (!currentQuestion && !finished) return null;

  if (finished) {
    const grade = gradeCheckpointTest(questions, selectedAnswers, xpReward);
    const missedQuestions = questions.filter(
      (q) => selectedAnswers[q.id] !== q.correctIndex
    );

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div
          data-testid="checkpoint-result-card"
          className="obsidian-surface spotlight-surface rounded-3xl p-8 space-y-6 text-center"
        >
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border ${
              grade.passed
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
            }`}
          >
            <Trophy className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-cyan-300">
              {mode === 'final'
                ? formatLabel('آزمون جامع پایان دوره', 'Final Course Mastery Exam')
                : formatLabel(
                    `آزمون پایان یونیت: ${unit?.titleFa ?? ''}`,
                    `Unit Mastery Test: ${unit?.titleEn ?? ''}`
                  )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              {grade.passed
                ? formatLabel('قبول شدید! تسلط کامل تایید شد', 'Test Passed! Mastery Unlocked')
                : formatLabel('نزدیک بود! یک مرور کوتاه و تلاش مجدد', 'Almost There — Keep Practicing!')}
            </h1>
            <p className="text-sm text-slate-400">
              {formatLabel(
                `حداقل نمره قبولی ۷۵٪ است. شما به ${grade.correctCount} از ${grade.totalCount} پرسش پاسخ درست دادید.`,
                `Passing threshold is 75%. You answered ${grade.correctCount} of ${grade.totalCount} correctly.`
              )}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 py-4 border-y border-slate-800/80">
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('نمره کل', 'Score')}
              </div>
              <div
                className={`font-mono-num text-2xl font-black ${
                  grade.passed ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {grade.percentage}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('پاسخ درست', 'Correct')}
              </div>
              <div className="font-mono-num text-2xl font-black text-white">
                {grade.correctCount}/{grade.totalCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {formatLabel('امتیاز دریافتی', 'XP Earned')}
              </div>
              <div className="font-mono-num text-2xl font-black text-cyan-300">
                +{grade.earnedXp}
              </div>
            </div>
          </div>

          {missedQuestions.length > 0 && (
            <div className="text-start space-y-2.5 pt-1">
              <div className="text-xs font-bold text-slate-300">
                {formatLabel('مرور پرسش‌های اشتباه:', 'Review Missed Questions:')}
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {missedQuestions.map((mq) => (
                  <div
                    key={mq.id}
                    className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="font-bold text-white">{mq.stimulus}</div>
                    <div className="text-emerald-300">
                      {formatLabel('پاسخ صحیح:', 'Correct answer:')} {mq.options[mq.correctIndex]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cta-emerald flex-1 py-3 px-6 rounded-xl text-slate-950 font-extrabold text-sm cursor-pointer"
            >
              {formatLabel('بازگشت', 'Done')}
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-slate-200 font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{formatLabel('آزمون مجدد', 'Retake Test')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(
    ((index + (stepChecked ? 1 : 0)) / Math.max(1, total)) * 100
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Bar */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          aria-label={formatLabel('خروج از آزمون', 'Exit Test')}
          onClick={() => {
            soundFX.tap();
            onClose();
          }}
          className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <div
            dir="ltr"
            className="w-full h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden p-0.5"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.max(8, progressPct)}%` }}
            />
          </div>
        </div>

        <div className="font-mono-num text-xs font-bold text-cyan-300 shrink-0">
          {index + 1} / {total}
        </div>
      </div>

      {/* Question Card */}
      <div
        data-testid="checkpoint-question-card"
        className="obsidian-surface rounded-3xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 text-cyan-300 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {mode === 'final'
                ? `${formatLabel('آزمون جامع', 'Final Exam')} · ${
                    uiLang === 'en'
                      ? currentQuestion.unitTitleEn
                      : currentQuestion.unitTitleFa
                  }`
                : uiLang === 'en'
                ? currentQuestion.unitTitleEn
                : currentQuestion.unitTitleFa}
            </span>
          </span>
          <span className="font-mono-num text-emerald-400 font-bold">
            +{xpReward} XP {formatLabel('در قبولی', 'on pass')}
          </span>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg sm:text-xl font-extrabold text-white">
            {uiLang === 'en' ? currentQuestion.promptEn : currentQuestion.promptFa}
          </h2>

          <div className="rounded-2xl bg-slate-950/75 border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div
              dir={currentQuestion.stimulusIsEn ? 'ltr' : 'rtl'}
              className={`text-xl sm:text-2xl font-black text-white ${
                currentQuestion.stimulusIsEn ? 'font-en' : 'font-fa'
              }`}
            >
              {currentQuestion.stimulus}
            </div>

            {currentQuestion.audioTextEn && (
              <button
                type="button"
                onClick={() => speakEnglish(currentQuestion.audioTextEn!, 0.94)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-cyan-300 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>{formatLabel('شنیدن تلفظ', 'Listen')}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentQuestion.options.map((opt, optIdx) => {
            const isEnOpt = /^[A-Za-z]/.test(opt);
            const isChosen = chosenOption === optIdx;
            const isRight = optIdx === currentQuestion.correctIndex;
            let style =
              'bg-slate-900/90 border-slate-800 hover:border-cyan-400/50 text-slate-100';
            if (stepChecked) {
              if (isRight) {
                style = 'bg-emerald-950/60 border-emerald-400 text-emerald-200';
              } else if (isChosen) {
                style = 'bg-rose-950/60 border-rose-500 text-rose-200';
              } else {
                style = 'bg-slate-900/50 border-slate-800/60 text-slate-500';
              }
            }
            return (
              <button
                key={optIdx}
                type="button"
                disabled={stepChecked}
                dir={isEnOpt ? 'ltr' : 'rtl'}
                onClick={() => handleSelectOption(optIdx)}
                className={`p-4 rounded-2xl border text-sm font-bold transition-colors flex items-center justify-between gap-2 text-start cursor-pointer ${style}`}
              >
                <span className={isEnOpt ? 'font-en' : 'font-fa'}>{opt}</span>
                {stepChecked && isRight && (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                {stepChecked && isChosen && !isRight && (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Step Explanation & Next */}
        {stepChecked && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {uiLang === 'en'
                ? currentQuestion.explanationEn
                : currentQuestion.explanationFa}
            </p>
            <button
              type="button"
              data-testid="checkpoint-next-btn"
              onClick={handleAdvance}
              className="cta-emerald px-6 py-2.5 rounded-xl text-slate-950 font-extrabold text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              {index + 1 >= total
                ? formatLabel('پایان و مشاهده نمره', 'Finish & See Score')
                : formatLabel('پرسش بعدی', 'Next Question')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
