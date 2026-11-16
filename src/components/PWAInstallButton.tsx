import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { UiLanguageMode } from './PronunciationLabView';
import { soundFX } from '../utils/soundEngine';

interface PWAInstallButtonProps {
  uiLang?: UiLanguageMode;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  uiLang = 'fa',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const formatLabel = (fa: string, en: string) =>
    uiLang === 'en' ? en : fa;

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={() => {
          soundFX.select();
          void install();
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span>{formatLabel('نصب اپلیکیشن', 'Install App')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          data-testid="pwa-ios-install-btn"
          onClick={() => {
            soundFX.tap();
            setShowIOSGuide(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-cyan-200 hover:border-cyan-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>{formatLabel('نصب در iOS', 'Install on iOS')}</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <div className="obsidian-surface w-full max-w-sm rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-extrabold text-white">
                  {formatLabel('نصب در آیفون و آیپد', 'Install on iPhone / iPad')}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={formatLabel('بستن', 'Close')}
                  className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white inline-flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {formatLabel(
                  '۱. دکمه Share را در نوار پایین مرورگر Safari لمس کنید. ۲. گزینه Add to Home Screen را انتخاب کنید.',
                  '1. Tap the Share button in the Safari toolbar. 2. Scroll down and tap Add to Home Screen.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl cta-emerald text-slate-950 font-bold text-sm cursor-pointer"
              >
                {formatLabel('متوجه شدم', 'Got it')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
