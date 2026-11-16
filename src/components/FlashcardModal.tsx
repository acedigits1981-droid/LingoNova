import React, { useEffect, useState } from 'react';
import { Volume2, Gauge, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { CurriculumUnit } from '../types/curriculum';
import { soundFX, speakEnglish } from '../utils/soundEngine';
import { UiLanguageMode } from './PronunciationLabView';

interface FlashcardModalProps {
  unit: CurriculumUnit;
  masteredWordIds: string[];
  onToggleMasteredWord: (wordId: string) => void;
  onClose: () => void;
  onStartUnitLesson: (unitId: string) => void;
  uiLang?: UiLanguageMode;
}

export const FlashcardModal: React.FC<FlashcardModalProps> = ({
  unit,
  masteredWordIds,
  onToggleMasteredWord,
  onClose,
  onStartUnitLesson,
  uiLang = 'fa',
}) => {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);

  const word = unit.words[index] ?? unit.words[0];
  const total = unit.words.length;
  const isMastered = masteredWordIds.includes(word.id);

  useEffect(() => {
    const timer = setTimeout(() => {
      speakEnglish(
        word.en,
        0.95,
        () => setSpeaking(true),
        () => setSpeaking(false)
      );
    }, 180);
    return () => clearTimeout(timer);
  }, [index, word.en]);

  const handleFlip = () => {
    soundFX.tap();
    setFlipped((prev) => !prev);
  };

  const handleNext = () => {
    if (index + 1 < total) {
      soundFX.tap();
      setFlipped(false);
      setIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (index > 0) {
      soundFX.tap();
      setFlipped(false);
      setIndex((i) => i - 1);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        soundFX.tap();
        setFlipped((prev) => !prev);
      } else if (e.key === 'ArrowRight') {
        if (uiLang === 'en') handleNext();
        else handlePrev();
      } else if (e.key === 'ArrowLeft') {
        if (uiLang === 'en') handlePrev();
        else handleNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Bar of Flashcard Studio */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => {
            soundFX.tap();
            onClose();
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {uiLang === 'en' ? (
            <ArrowLeft className="w-4 h-4" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          <span>{formatLabel('بازگشت به مسیر یادگیری', 'Back to Learning Path')}</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{uiLang === 'en' ? unit.titleEn : unit.titleFa}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num text-cyan-300 font-semibold">
            {index + 1} / {total}
          </span>
        </div>
      </div>

      {/* Progress Dots */}
      <div className="grid grid-cols-6 gap-2 mb-6" dir="ltr">
        {unit.words.map((w, idx) => (
          <button
            key={w.id}
            type="button"
            aria-label={`${formatLabel('واژه', 'Word')} ${w.en}`}
            onClick={() => {
              soundFX.tap();
              setFlipped(false);
              setIndex(idx);
            }}
            className={`h-2 rounded-full transition-colors cursor-pointer ${
              idx === index
                ? 'bg-cyan-400'
                : idx < index
                ? 'bg-emerald-500/70'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* 3D Flip Card Stage (Tap anywhere on card to flip) */}
      <div className="perspective-1000 my-4">
        <div
          onClick={handleFlip}
          data-testid="flashcard-stage"
          className={`preserve-3d relative w-full min-h-[380px] cursor-pointer ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* Front Face (English + Phonetic) */}
          <div className="backface-hidden obsidian-surface spotlight-surface rounded-3xl p-8 sm:p-10 flex flex-col items-center justify-between min-h-[380px]">
            <div className="w-full flex items-center justify-between text-xs text-slate-400">
              <span>
                {word.posFa} · {formatLabel('سطح', 'Level')} {unit.level}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundFX.select();
                  onToggleMasteredWord(word.id);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isMastered
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {isMastered
                    ? formatLabel('مسلط شدم', 'Mastered')
                    : formatLabel('افزودن به واژگان مسلط', 'Mark Mastered')}
                </span>
              </button>
            </div>

            <div className="flex flex-col items-center text-center my-4">
              <div className="text-5xl mb-4 select-none" aria-hidden="true">
                {word.emoji}
              </div>
              <h2
                dir="ltr"
                className="font-en text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-2"
              >
                {word.en}
              </h2>
              <p className="text-sm text-cyan-300 font-medium">
                {formatLabel('تلفظ فارسی:', 'Phonetic Guide:')} «{word.phoneticFa}»
              </p>

              {/* Audio Controls */}
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakEnglish(
                      word.en,
                      0.96,
                      () => setSpeaking(true),
                      () => setSpeaking(false)
                    );
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    speaking
                      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400'
                      : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:border-cyan-400/50'
                  }`}
                >
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span>{formatLabel('تلفظ عادی', 'Normal Voice')}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakEnglish(
                      word.en,
                      0.68,
                      () => setSpeaking(true),
                      () => setSpeaking(false)
                    );
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800/90 text-slate-300 border border-slate-700 hover:border-cyan-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Gauge className="w-4 h-4 text-emerald-400" />
                  <span>{formatLabel('تلفظ آهسته', 'Slow Voice')}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFlip}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              {formatLabel(
                'نمایش معنی فارسی و جمله نمونه (چرخش کارت)',
                'Flip Card to See Meaning & Example'
              )}
            </button>
          </div>

          {/* Back Face (Persian Translation + Context Example) */}
          <div className="backface-hidden rotate-y-180 obsidian-surface rounded-3xl p-8 sm:p-10 flex flex-col items-center justify-between min-h-[380px] border-emerald-500/30">
            <div className="w-full flex items-center justify-between text-xs text-slate-400">
              <span>{formatLabel('معادل فارسی و کاربرد در جمله', 'Translation & Example')}</span>
              <span dir="ltr" className="font-en font-semibold text-cyan-300">
                {word.en}
              </span>
            </div>

            <div className="text-center my-4 w-full max-w-md">
              <div className="text-3xl sm:text-4xl font-black text-white mb-6">
                {word.fa}
              </div>

              <div className="pt-5 border-t border-slate-800 space-y-2 text-center">
                <p
                  dir="ltr"
                  className="font-en text-lg font-bold text-cyan-300"
                >
                  {word.exampleEn}
                </p>
                <p className="text-sm text-slate-300">{word.exampleFa}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakEnglish(word.exampleEn, 0.92);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{formatLabel('شنیدن تلفظ جمله نمونه', 'Play Example Sentence')}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFlip();
              }}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              {formatLabel('بازگشت به روی انگلیسی کارت', 'Flip Back to English')}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-between gap-4 mt-6">
        <button
          type="button"
          onClick={handlePrev}
          disabled={index === 0}
          className="px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm font-bold text-slate-300 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {formatLabel('کلمه قبلی', 'Previous')}
        </button>

        {index + 1 < total ? (
          <button
            type="button"
            onClick={handleNext}
            className="cta-emerald flex-1 py-3 px-6 rounded-xl text-slate-950 font-extrabold text-sm whitespace-nowrap cursor-pointer"
          >
            {formatLabel('کلمه بعدی', 'Next Word')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              soundFX.select();
              onStartUnitLesson(unit.unitId);
            }}
            className="cta-emerald flex-1 py-3 px-6 rounded-xl text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{formatLabel('ورود به تمرین‌های این درس', 'Start Unit Lesson')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
