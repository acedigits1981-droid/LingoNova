import React, { useMemo, useState } from 'react';
import { Search, Volume2, Check } from 'lucide-react';
import { CurriculumUnit, VocabularyWord } from '../types/curriculum';
import { soundFX, speakEnglish } from '../utils/soundEngine';
import { UiLanguageMode } from './PronunciationLabView';

interface LexiconViewProps {
  units: CurriculumUnit[];
  masteredWordIds: string[];
  onToggleMasteredWord: (wordId: string) => void;
  uiLang?: UiLanguageMode;
}

export const LexiconView: React.FC<LexiconViewProps> = ({
  units,
  masteredWordIds,
  onToggleMasteredWord,
  uiLang = 'fa',
}) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const formatLabel = (fa: string, en: string) =>
    uiLang === 'en' ? en : fa;

  const allWords = useMemo(() => {
    const list: Array<
      VocabularyWord & {
        unitTitleFa: string;
        unitTitleEn: string;
        level: string;
      }
    > = [];
    for (const u of units) {
      for (const w of u.words) {
        list.push({
          ...w,
          unitTitleFa: u.titleFa,
          unitTitleEn: u.titleEn,
          level: u.level,
        });
      }
    }
    return list;
  }, [units]);

  const categories: Array<{ id: string; label: string }> = [
    { id: 'all', label: formatLabel('همه موضوعات', 'All Topics') },
    { id: 'greetings', label: formatLabel('احوالپرسی', 'Greetings') },
    { id: 'cafe', label: formatLabel('کافه و سفارش', 'Cafe & Ordering') },
    { id: 'travel', label: formatLabel('سفر و فرودگاه', 'Travel & Airport') },
    { id: 'tech', label: formatLabel('تکنولوژی', 'Technology') },
    { id: 'daily', label: formatLabel('روزمره و خرید', 'Daily & Shopping') },
    { id: 'feelings', label: formatLabel('احساسات و اهداف', 'Feelings & Goals') },
    { id: 'business', label: formatLabel('کار و مذاکره (B2)', 'Business (B2)') },
    { id: 'academic', label: formatLabel('تفکر انتقادی (C1)', 'Academic (C1)') },
    { id: 'mastery', label: formatLabel('تسلط کامل (C2)', 'Mastery (C2)') },
  ];

  const filteredWords = useMemo(() => {
    return allWords.filter((w) => {
      if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return (
        w.en.toLowerCase().includes(q) ||
        w.fa.includes(q) ||
        w.phoneticFa.includes(q) ||
        w.exampleEn.toLowerCase().includes(q)
      );
    });
  }, [allWords, categoryFilter, query]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {formatLabel(
              'واژهنامه جامع و بانک تلفظ',
              'Vocabulary Lexicon & Pronunciation Bank'
            )}
          </h1>
          <p className="text-sm text-slate-400">
            {formatLabel(
              'جستجو در تمام لغات، عبارتها و مثالهای کاربردی به همراه راهنمای تلفظ فارسی و پخش صوتی',
              'Search all vocabulary words, phrases, and practical examples with audio playback'
            )}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search
            className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
              uiLang === 'en' ? 'left-3.5' : 'right-3.5'
            }`}
          />
          <input
            type="search"
            aria-label={formatLabel(
              'جستجوی واژه انگلیسی یا فارسی',
              'Search vocabulary word'
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={formatLabel(
              'جستجوی کلمه (مثلاً Hello یا قهوه)...',
              'Search words (e.g. Hello or coffee)...'
            )}
            className={`w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 ${
              uiLang === 'en' ? 'pl-10 pr-4' : 'pr-10 pl-4'
            }`}
          />
        </div>
      </div>

      {/* Interactive Category Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6">
        {categories.map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                soundFX.tap();
                setCategoryFilter(cat.id);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                  : 'bg-slate-900/90 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Words Grid */}
      {filteredWords.length === 0 ? (
        <div className="obsidian-surface rounded-2xl p-12 text-center">
          <p className="text-base font-bold text-slate-300 mb-1">
            {formatLabel('واژهای با این عبارت یافت نشد', 'No matching words found')}
          </p>
          <p className="text-xs text-slate-500">
            {formatLabel(
              'عبارت جستجو را تغییر دهید یا فیلتر دستهبندی را روی «همه موضوعات» قرار دهید.',
              'Try another search query or reset the category filter to All Topics.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWords.map((word) => {
            const isMastered = masteredWordIds.includes(word.id);
            return (
              <div
                key={word.id}
                className="obsidian-surface spotlight-surface rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">
                        {uiLang === 'en'
                          ? `Level ${word.level} · ${word.unitTitleEn}`
                          : `${word.posFa} · سطح ${word.level} · ${word.unitTitleFa}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className="text-xl">
                          {word.emoji}
                        </span>
                        <h3
                          dir="ltr"
                          className="font-en text-xl font-extrabold text-white"
                        >
                          {word.en}
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={formatLabel(
                        `پخش تلفظ ${word.en}`,
                        `Play pronunciation for ${word.en}`
                      )}
                      onClick={() => speakEnglish(word.en, 0.94)}
                      className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-2.5 border-y border-slate-800/80 text-sm">
                    <span className="font-bold text-slate-100">{word.fa}</span>
                    <span className="text-xs text-cyan-300">
                      {formatLabel('تلفظ', 'Phonetic')}: «{word.phoneticFa}»
                    </span>
                  </div>

                  <div className="mt-3 space-y-1">
                    <p
                      dir="ltr"
                      className="font-en text-xs font-semibold text-slate-200"
                    >
                      {word.exampleEn}
                    </p>
                    {uiLang === 'fa' && (
                      <p className="text-xs text-slate-400">{word.exampleFa}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => speakEnglish(word.exampleEn, 0.92)}
                    className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    {formatLabel('شنیدن جمله نمونه', 'Listen to Example')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundFX.select();
                      onToggleMasteredWord(word.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isMastered
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {isMastered
                        ? formatLabel('مسلط هستم', 'Mastered')
                        : formatLabel('علامتگذاری تسلط', 'Mark Mastered')}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
