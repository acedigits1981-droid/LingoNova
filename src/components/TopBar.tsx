import React from 'react';
import { soundFX } from '../utils/soundEngine';
import { UiLanguageMode } from './PronunciationLabView';

export type AppSection =
  | 'path'
  | 'practice'
  | 'pronunciation'
  | 'leaderboard'
  | 'json_studio';

interface TopBarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  onQuickStartLesson: () => void;
  uiLang?: UiLanguageMode;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  onQuickStartLesson,
  uiLang = 'fa',
}) => {
  const formatLabel = (fa: string, en: string) => {
    return uiLang === 'en' ? en : fa;
  };

  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'path', label: formatLabel('یادگیری', 'Learn') },
    { id: 'practice', label: formatLabel('مرور و لغات', 'Practice') },
    { id: 'pronunciation', label: formatLabel('مکالمه و تلفظ', 'Speak') },
    { id: 'leaderboard', label: formatLabel('لیگ و اهداف', 'League') },
    { id: 'json_studio', label: formatLabel('درس‌ساز', 'Builder') },
  ];

  return (
    <header className="w-full border-b border-slate-800/80 bg-[#070A10]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => {
            soundFX.tap();
            onSelectSection('path');
          }}
          className="font-en text-base sm:text-xl font-extrabold tracking-tight text-white hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          LingoNova
        </button>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label={formatLabel('ناوبری اصلی', 'Main Navigation')}
          className="flex items-center gap-2 sm:gap-6 md:gap-7 overflow-x-auto no-scrollbar"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-tab-${item.id}`}
                onClick={() => {
                  soundFX.tap();
                  onSelectSection(item.id);
                }}
                className={`text-[11px] sm:text-xs md:text-sm font-semibold py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-cyan-300 border-cyan-400'
                    : 'text-slate-400 border-transparent hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action (visible sm+ — mobile Active Unit banner already provides full-width primary CTA) */}
        <div className="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            data-testid="topbar-start-btn"
            onClick={() => {
              soundFX.select();
              onQuickStartLesson();
            }}
            className="cta-emerald text-slate-950 font-bold text-xs md:text-sm px-4 py-2 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
          >
            {formatLabel('شروع درس', 'Start Lesson')}
          </button>
        </div>
      </div>
    </header>
  );
};

