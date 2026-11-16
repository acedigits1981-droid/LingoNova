import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Volume2 } from 'lucide-react';
import { ENGLISH_ALPHABET, AlphabetLetterItem } from '../utils/alphabetData';
import { soundFX, speakEnglish } from '../utils/soundEngine';
import { UiLanguageMode } from './PronunciationLabView';

interface AlphabetMiniStripProps {
  uiLang?: UiLanguageMode;
  defaultExpanded?: boolean;
}

export const AlphabetMiniStrip: React.FC<AlphabetMiniStripProps> = ({
  uiLang = 'fa',
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selected, setSelected] = useState<AlphabetLetterItem>(ENGLISH_ALPHABET[0]);

  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);

  const handlePickLetter = (item: AlphabetLetterItem) => {
    soundFX.tap();
    setSelected(item);
    speakEnglish(`${item.letter}. ${item.exampleWord}`, 0.88);
  };

  return (
    <section
      data-testid="alphabet-mini-strip"
      className="obsidian-surface rounded-2xl border border-slate-800/90 overflow-hidden"
    >
      {/* Compact Header Row */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            dir="ltr"
            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/30 font-en font-extrabold text-xs text-cyan-200 shrink-0"
          >
            Aa–Zz
          </span>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white truncate">
              {formatLabel('الفبای انگلیسی و تلفظ حروف', 'English A–Z Alphabet')}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {formatLabel(
                '۲۶ حرف با تلفظ صوتی و کلمه نمونه (برای مرور سریع)',
                'Quick 26-letter audio guide & sample words'
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          data-testid="alphabet-toggle-btn"
          onClick={() => {
            soundFX.tap();
            setExpanded((prev) => !prev);
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-cyan-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <span>
            {expanded
              ? formatLabel('بستن الفبا', 'Hide A–Z')
              : formatLabel('مشاهده الفبا', 'Open A–Z')}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Expanded Compact 26-Letter Grid + Audio Spotlight */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 space-y-3">
          <div
            dir="ltr"
            data-testid="alphabet-letter-grid"
            className="grid grid-cols-7 sm:grid-cols-13 gap-1.5"
          >
            {ENGLISH_ALPHABET.map((item) => {
              const isSelected = selected.letter === item.letter;
              return (
                <button
                  key={item.letter}
                  type="button"
                  data-testid={`alpha-btn-${item.letter}`}
                  onClick={() => handlePickLetter(item)}
                  className={`py-1.5 px-1 rounded-lg border text-center transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-slate-200'
                  }`}
                >
                  <div className="font-en font-extrabold text-xs leading-tight">
                    {item.letter}
                    <span className="text-slate-400 font-semibold">{item.lower}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
                    {item.phoneticFa}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Letter Mini Spotlight */}
          <div
            data-testid="alphabet-spotlight"
            className="rounded-xl bg-slate-950/80 border border-slate-800/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div
                dir="ltr"
                className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center font-en font-black text-lg text-cyan-200 shrink-0"
              >
                {selected.letter}
                {selected.lower}
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                  <span aria-hidden="true">{selected.emoji}</span>
                  <span dir="ltr" className="font-en text-emerald-300">
                    {selected.exampleWord}
                  </span>
                  <span className="text-slate-400">({selected.exampleFa})</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatLabel('تلفظ حرف:', 'Letter sound:')} «{selected.phoneticFa}»
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => speakEnglish(selected.letter, 0.85)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-semibold text-cyan-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{formatLabel('تلفظ حرف', 'Hear Letter')}</span>
              </button>
              <button
                type="button"
                onClick={() => speakEnglish(selected.exampleWord, 0.9)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-400/50 text-xs font-semibold text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{formatLabel('تلفظ کلمه', 'Hear Word')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
