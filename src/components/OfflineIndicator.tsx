import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { UiLanguageMode } from './PronunciationLabView';

interface OfflineIndicatorProps {
  uiLang?: UiLanguageMode;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  uiLang = 'fa',
}) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 border border-amber-300/40 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {uiLang === 'en'
          ? 'Offline Mode — Cached lessons active'
          : 'حالت آفلاین — مرور دروس از حافظه داخلی'}
      </span>
    </div>
  );
};
