import React, { useState } from 'react';
import { Check, AlertTriangle, Play, RotateCcw, Code2 } from 'lucide-react';
import { CurriculumUnit } from '../types/curriculum';
import { validateUnitJson } from '../utils/lessonEngine';
import { soundFX } from '../utils/soundEngine';

import { UiLanguageMode } from './PronunciationLabView';

interface JsonStudioViewProps {
  units: CurriculumUnit[];
  onAddOrUpdateUnit: (unit: CurriculumUnit) => void;
  onStartUnitLesson: (unitId: string) => void;
  uiLang?: UiLanguageMode;
}

const USER_ORIGINAL_SAMPLE = JSON.stringify(
  {
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
      {
        id: 'w_i',
        en: 'I',
        fa: 'من',
        phoneticFa: 'آی',
        emoji: '🙋',
        category: 'greetings',
      },
      {
        id: 'w_am',
        en: 'am',
        fa: 'هستم',
        phoneticFa: 'اَم',
        emoji: '✨',
        category: 'greetings',
      },
    ],
    exercises: [
      {
        id: 'ex_101',
        type: 'word_bank',
        promptFa: 'این جمله را به انگلیسی بسازید:',
        sourceFa: 'سلام، من سارا هستم',
        targetEn: ['Hello', 'I', 'am', 'Sara'],
        acceptedAnswers: ['Hello I am Sara', "Hello, I'm Sara"],
        distractorsEn: ['water', 'apple', 'you'],
        grammarTipFa:
          'در انگلیسی «I am» یعنی «من هستم» و ضمیر «I» (من) در هر جای جمله که باشد همیشه با حرف بزرگ نوشته میشود.',
      },
    ],
  },
  null,
  2
);

export const JsonStudioView: React.FC<JsonStudioViewProps> = ({
  units,
  onAddOrUpdateUnit,
  onStartUnitLesson,
  uiLang = 'fa',
}) => {
  const [jsonText, setJsonText] = useState(USER_ORIGINAL_SAMPLE);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formatLabel = (fa: string, en: string) =>
    uiLang === 'en' ? en : fa;

  const validation = validateUnitJson(jsonText);

  const handleLoadExistingUnit = (unit: CurriculumUnit) => {
    soundFX.tap();
    setJsonText(JSON.stringify(unit, null, 2));
    setStatusMessage(null);
  };

  const handleApplyAndPlay = () => {
    if (!validation.valid || !validation.unit) {
      soundFX.error();
      return;
    }
    soundFX.success();
    onAddOrUpdateUnit(validation.unit);
    setStatusMessage(
      uiLang === 'en'
        ? `Unit "${validation.unit.titleEn}" saved successfully.`
        : `یونیت «${validation.unit.titleFa}» با موفقیت در برنامه ثبت شد.`
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {formatLabel(
              'استودیو ساختار داده و ویرایشگر JSON دروس',
              'Curriculum Data & JSON Unit Studio'
            )}
          </h1>
          <p className="text-sm text-slate-400">
            {formatLabel(
              'ساختار JSON پیشنهادی خودتان را مستقیماً بررسی، ویرایش و اعتبارسنجی کنید و بلافاصله در محیط واقعی اجرا نمایید',
              'Inspect, edit, and validate CurriculumUnit JSON schemas and run custom lessons immediately'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {units.map((u) => (
            <button
              key={u.unitId}
              type="button"
              onClick={() => handleLoadExistingUnit(u)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {formatLabel(`بارگذاری ${u.unitId}`, `Load ${u.unitId}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              soundFX.tap();
              setJsonText(USER_ORIGINAL_SAMPLE);
              setStatusMessage(null);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-cyan-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{formatLabel('نمونه اولیه اصلاحشده', 'Reset Sample')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* JSON Code Editor */}
        <div className="lg:col-span-7 obsidian-surface rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <span>
                {formatLabel('ویرایشگر مستقیم JSON یونیت', 'Direct Unit JSON Editor')}
              </span>
            </span>
            <span dir="ltr" className="font-mono-num">
              Schema: CurriculumUnit
            </span>
          </div>

          <textarea
            dir="ltr"
            aria-label={formatLabel('ویرایشگر JSON یونیت', 'Unit JSON Editor')}
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setStatusMessage(null);
            }}
            rows={18}
            className="w-full p-4 rounded-2xl bg-[#05070B] border border-slate-800 font-mono-num text-xs sm:text-sm text-emerald-300 leading-relaxed focus:outline-none focus:border-cyan-400 resize-y"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={!validation.valid}
              onClick={handleApplyAndPlay}
              className="cta-emerald px-5 py-2.5 rounded-xl text-slate-950 font-extrabold text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              {formatLabel(
                'ذخیره و بروزرسانی یونیت در برنامه',
                'Save & Update Unit'
              )}
            </button>

            {validation.valid && validation.unit && (
              <button
                type="button"
                onClick={() => {
                  onAddOrUpdateUnit(validation.unit!);
                  onStartUnitLesson(validation.unit!.unitId);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4 text-cyan-300" />
                <span>
                  {formatLabel('اجرای فوری این یونیت', 'Launch Unit Now')}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Live Schema Diagnostic & Pedagogical Linter */}
        <div className="lg:col-span-5 obsidian-surface rounded-3xl p-6 space-y-5">
          <h2 className="text-lg font-extrabold text-white">
            {formatLabel(
              'گزارش اعتبارسنجی اسکیما و بررسی آموزشی',
              'Schema Validation & Pedagogical Linter'
            )}
          </h2>

          {validation.valid && validation.unit ? (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  {formatLabel(
                    'ساختار JSON کاملاً معتبر و قابل اجراست',
                    'JSON schema is valid and ready to run'
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <div>
                  {formatLabel('عنوان درس:', 'Unit Title:')}{' '}
                  <strong>
                    {uiLang === 'en'
                      ? validation.unit.titleEn
                      : validation.unit.titleFa}
                  </strong>
                </div>
                <div>
                  {formatLabel(
                    `تعداد واژگان: ${validation.unit.words.length} واژه · تعداد تمرینها: ${validation.unit.exercises.length} تمرین`,
                    `Vocabulary: ${validation.unit.words.length} words · Exercises: ${validation.unit.exercises.length}`
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs sm:text-sm font-semibold">
              {validation.error}
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-400/40 text-cyan-200 text-xs font-semibold">
              {statusMessage}
            </div>
          )}

          {/* Pedagogical Warnings */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-300">
              {formatLabel(
                'نکات هوشمند بررسی محتوا (Linter):',
                'Curriculum Linter Insights:'
              )}
            </div>
            {validation.warnings.length === 0 ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                {uiLang === 'en' ? (
                  <>
                    No mismatches detected between{' '}
                    <code className="font-mono-num text-cyan-300">words</code>{' '}
                    and{' '}
                    <code className="font-mono-num text-cyan-300">
                      exercises
                    </code>{' '}
                    arrays.
                  </>
                ) : (
                  <>
                    هیچ مغایرتی بین واژگان تعریفشده در آرایه{' '}
                    <code className="font-mono-num text-cyan-300">words</code> و
                    تمرینهای{' '}
                    <code className="font-mono-num text-cyan-300">
                      exercises
                    </code>{' '}
                    مشاهده نشد.
                  </>
                )}
              </p>
            ) : (
              validation.warnings.map((w, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-200 leading-relaxed"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))
            )}
          </div>

          {/* Improvements Reference */}
          <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400 leading-relaxed">
            <div className="font-bold text-slate-200">
              {formatLabel(
                'ویژگیهای پشتیبانی شده در موتور LingoNova:',
                'Supported LingoNova Engine Features:'
              )}
            </div>
            <p>
              {uiLang === 'en' ? (
                <>
                  1. Supports 6 exercise formats:{' '}
                  <code className="font-mono-num text-cyan-300">word_bank</code>,{' '}
                  <code className="font-mono-num text-cyan-300">speaking</code>,{' '}
                  <code className="font-mono-num text-cyan-300">multiple_choice</code>,{' '}
                  <code className="font-mono-num text-cyan-300">listening</code>,{' '}
                  <code className="font-mono-num text-cyan-300">matching_pairs</code>, and{' '}
                  <code className="font-mono-num text-cyan-300">fill_blank</code>.
                </>
              ) : (
                <>
                  ۱. پشتیبانی از ۶ نوع تمرین:{' '}
                  <code className="font-mono-num text-cyan-300">word_bank</code>،{' '}
                  <code className="font-mono-num text-cyan-300">speaking</code> (تشخیص گفتار Web Speech)،{' '}
                  <code className="font-mono-num text-cyan-300">multiple_choice</code>،{' '}
                  <code className="font-mono-num text-cyan-300">listening</code>،{' '}
                  <code className="font-mono-num text-cyan-300">matching_pairs</code> و{' '}
                  <code className="font-mono-num text-cyan-300">fill_blank</code>.
                </>
              )}
            </p>
            <p>
              {uiLang === 'en' ? (
                <>
                  2. Smart contraction equivalence (
                  <code className="font-mono-num text-cyan-300">I'm = I am</code>) and punctuation normalization for typed and spoken answers.
                </>
              ) : (
                <>
                  ۲. تشخیص هوشمند حالتهای اختصاری (
                  <code className="font-mono-num text-cyan-300">I'm = I am</code>) و نادیده گرفتن علائم نگارشی در پاسخهای متنی و صوتی کاربر.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
