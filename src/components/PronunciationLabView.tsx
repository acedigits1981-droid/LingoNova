import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Radio,
  TrendingUp,
  Activity,
  RotateCcw,
  PlusCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { CurriculumUnit } from '../types/curriculum';
import {
  calculateRealtimeConfidenceMeter,
  DEFAULT_PRONUNCIATION_HISTORY,
  PronunciationAttemptRecord,
  computeAccuracyTrendStats,
  appendPronunciationAttempt,
} from '../utils/lessonEngine';
import {
  generateVoiceSpectrumBands,
  requestMicrophonePermission,
  soundFX,
  speakEnglish,
  startEnglishSpeechRecognition,
} from '../utils/soundEngine';

import {
  HUMAN_VOICE_PRESETS,
  HumanVoiceId,
} from '../utils/ttsHelpers';

export type UiLanguageMode = 'fa' | 'en';

interface PronunciationLabViewProps {
  units: CurriculumUnit[];
  onEarnPracticeXp: (amount: number) => void;
  uiLang?: UiLanguageMode;
  selectedVoice?: HumanVoiceId;
  onSelectVoice?: (voice: HumanVoiceId) => void;
  initialUnitId?: string | null;
}

interface PracticePhrase {
  id: string;
  en: string;
  fa: string;
  phoneticFa: string;
  unitTitleFa: string;
  unitTitleEn: string;
}

const HISTORY_STORAGE_KEY = 'lingonova_pronunciation_history_v1';

const SPECTRUM_FREQ_LABELS = [
  '85Hz',
  '140Hz',
  '220Hz',
  '340Hz',
  '500Hz',
  '750Hz',
  '1.0k',
  '1.4k',
  '1.9k',
  '2.5k',
  '3.2k',
  '4.0k',
  '5.0k',
  '6.2k',
  '7.4k',
  '8.5k',
];

export const PronunciationLabView: React.FC<PronunciationLabViewProps> = ({
  units,
  onEarnPracticeXp,
  uiLang = 'fa',
  selectedVoice = 'Kore',
  onSelectVoice,
  initialUnitId,
}) => {
  const phrases: PracticePhrase[] = useMemo(
    () =>
      units.flatMap((u) =>
        u.words.slice(0, 2).map((w) => ({
          id: `prac_${u.unitId}_${w.id}`,
          en: w.exampleEn,
          fa: w.exampleFa,
          phoneticFa: w.phoneticFa,
          unitTitleFa: u.titleFa,
          unitTitleEn: u.titleEn,
        }))
      ),
    [units]
  );

  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!initialUnitId) return;
    const matchIdx = phrases.findIndex((p) =>
      p.id.startsWith(`prac_${initialUnitId}_`)
    );
    if (matchIdx >= 0) {
      setSelectedIdx(matchIdx);
    }
  }, [initialUnitId, phrases]);
  const [spokenInput, setSpokenInput] = useState('');
  const [rawConfidence, setRawConfidence] = useState<number | undefined>(
    undefined
  );
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [spectrumBands, setSpectrumBands] = useState<number[]>(() =>
    generateVoiceSpectrumBands(0, 0)
  );
  const [micPermissionState, setMicPermissionState] = useState<
    'idle' | 'granted' | 'simulated' | 'denied'
  >('idle');
  const [micNotice, setMicNotice] = useState<{
    fa: string;
    en: string;
    tone: 'info' | 'error';
  } | null>(null);
  const [rewardedPhraseIds, setRewardedPhraseIds] = useState<string[]>([]);
  const [history, setHistory] = useState<PronunciationAttemptRecord[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PRONUNCIATION_HISTORY;
  });

  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activePhrase = phrases[selectedIdx] ?? phrases[0];
  const targetWords = activePhrase.en.split(' ');

  // Persist pronunciation history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore
    }
  }, [history]);

  // Real-time confidence meter state calculated dynamically on every keystroke or interim speech frame
  const meterState = useMemo(
    () =>
      calculateRealtimeConfidenceMeter(
        activePhrase.en,
        spokenInput,
        rawConfidence
      ),
    [activePhrase.en, spokenInput, rawConfidence]
  );

  // Summary statistics for the historical Recharts accuracy trend view
  const trendStats = useMemo(
    () => computeAccuracyTrendStats(history),
    [history]
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, []);

  // Automatically award practice XP when real-time confidence reaches green (>= 80%)
  useEffect(() => {
    if (
      meterState.tier === 'green' &&
      !rewardedPhraseIds.includes(activePhrase.id)
    ) {
      setRewardedPhraseIds((prev) => [...prev, activePhrase.id]);
      soundFX.success();
      onEarnPracticeXp(10);
    }
  }, [meterState.tier, activePhrase.id, rewardedPhraseIds, onEarnPracticeXp]);

  const formatLabel = (fa: string, en: string) => {
    return uiLang === 'en' ? en : fa;
  };

  const recordAttemptToHistory = (
    phraseEn: string,
    transcriptEn: string,
    conf?: number
  ) => {
    setHistory((prev) =>
      appendPronunciationAttempt(prev, phraseEn, transcriptEn, conf)
    );
  };

  const triggerMicSpectrumPulse = (targetLevel = 76, durationMs = 750) => {
    if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    let tick = 1;
    setAudioLevel(targetLevel);
    setSpectrumBands(generateVoiceSpectrumBands(targetLevel, tick));
    waveIntervalRef.current = setInterval(() => {
      tick += 1;
      const modulated = Math.max(
        38,
        Math.min(96, targetLevel + Math.round(Math.sin(tick * 0.9) * 14))
      );
      setAudioLevel(modulated);
      setSpectrumBands(generateVoiceSpectrumBands(modulated, tick));
    }, 85);

    setTimeout(() => {
      if (waveIntervalRef.current) {
        clearInterval(waveIntervalRef.current);
        waveIntervalRef.current = null;
      }
      if (!isRecording) {
        setAudioLevel(0);
        setSpectrumBands(generateVoiceSpectrumBands(0, 0));
      }
    }, durationMs);
  };

  const handleEnableMicrophone = async () => {
    soundFX.tap();
    setMicNotice(null);
    const res = await requestMicrophonePermission();
    setMicPermissionState(res);
    triggerMicSpectrumPulse(72, 650);
  };

  const handleToggleMicrophoneSpeech = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setAudioLevel(0);
      setSpectrumBands(generateVoiceSpectrumBands(0, 0));
      return;
    }

    setMicNotice(null);
    recognitionRef.current = startEnglishSpeechRecognition({
      expectedPhraseEn: activePhrase.en,
      onStart: () => {
        setIsRecording(true);
      },
      onMicStatus: (status) => {
        setMicPermissionState(status);
      },
      onAudioLevel: (lvl) => {
        setAudioLevel(lvl);
      },
      onSpectrumBands: (bands) => {
        setSpectrumBands(bands);
      },
      onInterim: (interimTranscript, conf) => {
        setSpokenInput(interimTranscript);
        setRawConfidence(conf);
      },
      onResult: (finalTranscript, _isSimulated, conf) => {
        setSpokenInput(finalTranscript);
        setRawConfidence(conf);
        recordAttemptToHistory(activePhrase.en, finalTranscript, conf);
        soundFX.match();
      },
      onError: (code, msgFa, msgEn) => {
        setMicNotice({
          fa: msgFa,
          en: msgEn,
          tone: code === 'not-allowed' ? 'error' : 'info',
        });
      },
      onEnd: () => {
        setIsRecording(false);
        setAudioLevel(0);
        setSpectrumBands(generateVoiceSpectrumBands(0, 0));
      },
    });
  };

  // Determine feedback bar color and icon based on real-time meter tier
  const barColorClass =
    meterState.tier === 'green'
      ? 'bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.55)]'
      : meterState.tier === 'yellow'
      ? 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]'
      : meterState.tier === 'red'
      ? 'bg-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.5)]'
      : 'bg-slate-700';

  const statusBadgeColorClass =
    meterState.tier === 'green'
      ? 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40'
      : meterState.tier === 'yellow'
      ? 'text-amber-300 bg-amber-950/40 border-amber-500/40'
      : meterState.tier === 'red'
      ? 'text-rose-300 bg-rose-950/40 border-rose-500/40'
      : 'text-slate-400 bg-slate-900 border-slate-800';

  const peakBandIndex = useMemo(() => {
    let bestIdx = 4;
    let bestVal = -1;
    spectrumBands.forEach((val, idx) => {
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }, [spectrumBands]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header & Microphone Status Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {formatLabel(
              'آزمایشگاه تلفظ و تشخیص گفتار زنده',
              'Pronunciation Lab & Real-Time Speech Recognition'
            )}
          </h1>
          <p className="text-sm text-slate-400">
            {formatLabel(
              'میکروفون را فعال کنید، طیف صوتی زنده را ببینید و روند پیشرفت دقت تلفظ خود را در نمودار دنبال کنید',
              'Enable your microphone, inspect real-time voice spectrum visualization, and track your pronunciation accuracy trends over time'
            )}
          </p>
        </div>

        {/* Enable Microphone Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleEnableMicrophone}
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              micPermissionState === 'denied'
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                : micPermissionState !== 'idle'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-900 border-slate-700 hover:border-cyan-400/50 text-cyan-300'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>
              {micPermissionState === 'granted'
                ? formatLabel('میکروفون متصل است', 'Microphone Active')
                : micPermissionState === 'denied'
                ? formatLabel('دسترسی میکروفون مسدود است', 'Microphone Blocked')
                : micPermissionState === 'simulated'
                ? formatLabel(
                    'میکروفون آماده (تشخیص هوشمند)',
                    'Microphone Enabled (Smart Stream)'
                  )
                : formatLabel('فعال کردن میکروفون', 'Enable Microphone')}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Right Column (5 Cols): Practice Phrases Deck */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="text-xs font-semibold text-slate-400 mb-3">
            {formatLabel(
              `جملات منتخب تمرینی (${phrases.length} عبارت)`,
              `Practice Sentences (${phrases.length} Phrases)`
            )}
          </div>
          {phrases.map((item, idx) => {
            const isSelected = idx === selectedIdx;
            const isRewarded = rewardedPhraseIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  recognitionRef.current?.stop();
                  soundFX.tap();
                  setSelectedIdx(idx);
                  setSpokenInput('');
                  setRawConfidence(undefined);
                  setIsRecording(false);
                  setAudioLevel(0);
                  setSpectrumBands(generateVoiceSpectrumBands(0, 0));
                }}
                className={`w-full p-4 rounded-2xl border text-right transition-colors cursor-pointer ${
                  isSelected
                    ? 'obsidian-surface border-cyan-400/60 bg-cyan-950/20'
                    : 'obsidian-surface border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>
                    {uiLang === 'en' ? item.unitTitleEn : item.unitTitleFa}
                  </span>
                  {isRewarded && (
                    <span className="text-emerald-400 font-semibold">
                      ✓ {formatLabel('تکمیل شد', 'Mastered')}
                    </span>
                  )}
                </div>
                <div
                  dir="ltr"
                  className="font-en font-bold text-sm sm:text-base text-white text-left"
                >
                  {item.en}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>{item.fa}</span>
                  <span className="text-cyan-300">«{item.phoneticFa}»</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Pronunciation Arena + Visualizer + Historical Recharts Trend (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Active Pronunciation Studio & Real-Time Confidence + Microphone Visualization */}
          <div className="obsidian-surface rounded-3xl p-6 sm:p-8 border border-slate-800/90 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
                <Gauge className="w-4 h-4" />
                <span>
                  {uiLang === 'en'
                    ? activePhrase.unitTitleEn
                    : activePhrase.unitTitleFa}
                </span>
              </div>
              <span className="text-xs text-emerald-400 font-semibold">
                <span className="font-mono-num">+10 XP</span> ·{' '}
                {formatLabel('پاداش تلفظ دقیق', 'Pronunciation Reward')}
              </span>
            </div>

            {/* Target Sentence with Per-Word Real-Time Similarity Highlighting */}
            <div className="text-center space-y-4 py-2">
              <div
                dir="ltr"
                className="flex flex-wrap items-center justify-center gap-2.5"
              >
                {targetWords.map((word, idx) => {
                  const wordSim = meterState.wordScores[idx] ?? 0;
                  const hasInput = spokenInput.trim().length > 0;

                  const wordStyle = !hasInput
                    ? 'bg-slate-900 border-slate-800 text-white hover:border-cyan-400/50'
                    : wordSim >= 80
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                    : wordSim >= 50
                    ? 'bg-amber-950/60 border-amber-500/60 text-amber-200'
                    : 'bg-rose-950/50 border-rose-500/50 text-rose-200';

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => speakEnglish(word, 0.85)}
                      className={`px-3.5 py-2 rounded-xl border font-en font-extrabold text-xl sm:text-2xl transition-all cursor-pointer flex flex-col items-center ${wordStyle}`}
                    >
                      <span>{word}</span>
                      {hasInput && (
                        <span className="font-mono-num text-[11px] font-semibold opacity-90 mt-0.5">
                          {wordSim}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1">
                <p className="text-base text-slate-200 font-bold">
                  {activePhrase.fa}
                </p>
                <p className="text-xs text-cyan-300">
                  {formatLabel('راهنمای آوایی', 'Phonetic Guide')}: «
                  {activePhrase.phoneticFa}»
                </p>
              </div>
            </div>

            {/* REAL-TIME CONFIDENCE METER (Green / Yellow / Red Feedback Bar) */}
            <div
              data-testid="realtime-confidence-meter"
              data-tier={meterState.tier}
              className="p-5 rounded-2xl bg-slate-950/75 border border-slate-800/90 space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-200">
                    {formatLabel(
                      'نشانگر زنده دقت و اعتماد تلفظ',
                      'Real-Time Pronunciation Confidence Meter'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatLabel(
                      'قرمز (<50%) · زرد (50%–79%) · سبز (80%–100%)',
                      'Red (<50%) · Yellow (50%–79%) · Green (80%–100%)'
                    )}
                  </div>
                </div>

                {/* Status Badge with Icon + Score */}
                <div
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 ${statusBadgeColorClass}`}
                >
                  {meterState.tier === 'green' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : meterState.tier === 'yellow' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : meterState.tier === 'red' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <Mic className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span>
                    {formatLabel(meterState.labelFa, meterState.labelEn)}
                  </span>
                  <span className="font-mono-num text-sm font-black">
                    {meterState.score}%
                  </span>
                </div>
              </div>

              {/* Dynamic Green / Yellow / Red Feedback Progress Bar */}
              <div className="relative pt-1">
                <div
                  dir="ltr"
                  className="w-full h-4 rounded-full bg-slate-900 border border-slate-800 overflow-hidden p-0.5 relative"
                >
                  {/* Threshold Calibration Markers at 50% and 80% */}
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[50%] w-px bg-slate-700/80 z-10"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[80%] w-px bg-slate-600/80 z-10"
                  />

                  <div
                    data-testid="confidence-meter-bar"
                    className={`h-full rounded-full transition-all duration-200 ${barColorClass}`}
                    style={{
                      width: `${Math.max(
                        meterState.score > 0 ? 6 : 0,
                        meterState.score
                      )}%`,
                    }}
                  />
                </div>

                <div
                  dir={uiLang === 'en' ? 'ltr' : 'rtl'}
                  className="flex items-center justify-between text-[10px] font-mono-num text-slate-500 mt-1.5 px-1"
                >
                  <span className="text-rose-400/80">
                    {formatLabel('۰٪ قرمز (نیاز به تمرین)', '0% Red (Needs Work)')}
                  </span>
                  <span className="text-amber-300/80">
                    {formatLabel('۵۰٪ زرد (متوسط)', '50% Yellow (Fair)')}
                  </span>
                  <span className="text-emerald-400/90">
                    {formatLabel('۸۰٪+ سبز (مسلط)', '80%+ Green (Fluent)')}
                  </span>
                </div>
              </div>
            </div>

            {/* LIVE MICROPHONE VISUALIZATION (16-Band Frequency Spectrum & Acoustic Waveform) */}
            <div
              data-testid="microphone-visualizer"
              data-recording={isRecording ? 'true' : 'false'}
              className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800/90 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity
                    className={`w-4 h-4 ${
                      isRecording || audioLevel > 0
                        ? 'text-cyan-400 animate-pulse'
                        : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      {formatLabel(
                        'طیف‌سنج زنده صدای میکروفون (۱۶ باند فرکانسی)',
                        'Live Microphone Acoustic Spectrum Visualizer (16-Band FFT)'
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatLabel(
                        'نمایش زنده انرژی صوتی و فرکانس گفتار هنگام تلفظ',
                        'Real-time vocal frequency spectrum and decibel input monitor'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    dir="ltr"
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono-num text-[11px] text-cyan-300 font-semibold"
                  >
                    {audioLevel > 0
                      ? `${audioLevel} dB`
                      : formatLabel('42 dB پایه', '42 dB Floor')}{' '}
                    · {formatLabel('اوج', 'Peak')} {SPECTRUM_FREQ_LABELS[peakBandIndex]}
                  </span>
                  <button
                    type="button"
                    data-testid="pulse-mic-wave-btn"
                    onClick={() => {
                      soundFX.tap();
                      triggerMicSpectrumPulse(82, 900);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-500/40 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/50 cursor-pointer"
                  >
                    {formatLabel('تست موج میکروفون', 'Pulse Mic Wave')}
                  </button>
                </div>
              </div>

              {/* 16-Band Acoustic Spectrum Bars */}
              <div
                dir="ltr"
                data-testid="mic-spectrum-bars"
                className="h-24 px-3 py-2.5 rounded-xl bg-[#070B12] border border-slate-800/90 flex items-end justify-between gap-1.5"
              >
                {spectrumBands.map((bandValue, idx) => {
                  const isActive = isRecording || audioLevel > 0;
                  const barHeightPct = isActive
                    ? Math.max(16, bandValue)
                    : Math.max(14, 18 + Math.round(Math.sin(idx * 0.7) * 8));

                  const bandColor =
                    !isActive
                      ? 'bg-gradient-to-t from-cyan-500/40 to-emerald-400/40'
                      : bandValue >= 75
                      ? 'bg-gradient-to-t from-emerald-500 via-cyan-400 to-teal-200 shadow-[0_0_10px_rgba(16,185,129,0.45)]'
                      : bandValue >= 45
                      ? 'bg-gradient-to-t from-cyan-600 to-cyan-300'
                      : 'bg-gradient-to-t from-slate-700 to-cyan-500/70';

                  return (
                    <div
                      key={idx}
                      className="flex-1 h-full flex flex-col items-center justify-end gap-1"
                    >
                      <div className="w-full h-full flex items-end">
                        <div
                          className={`w-full rounded-t-md transition-all duration-100 ${bandColor}`}
                          style={{ height: `${barHeightPct}%` }}
                        />
                      </div>
                      <span className="font-mono-num text-[9px] text-slate-500 leading-none hidden sm:inline">
                        {SPECTRUM_FREQ_LABELS[idx]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Humanized Neural Voice Selector & Audio Playback Controls */}
            <div className="space-y-3">
              {onSelectVoice && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-slate-400 font-semibold">
                    {formatLabel('گوینده صدای طبیعی:', 'Humanized Coach Voice:')}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {HUMAN_VOICE_PRESETS.map((preset) => {
                      const active = selectedVoice === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-testid={`speech-voice-${preset.id}`}
                          onClick={() => {
                            onSelectVoice(preset.id);
                            triggerMicSpectrumPulse(70, 700);
                            speakEnglish(activePhrase.en, 0.96, undefined, undefined, preset.id);
                          }}
                          title={uiLang === 'en' ? preset.toneEn : preset.toneFa}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {uiLang === 'en' ? preset.nameEn : preset.nameFa}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="listen-normal-btn"
                  onClick={() => {
                    triggerMicSpectrumPulse(68, 700);
                    speakEnglish(activePhrase.en, 0.95);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400/50 text-xs font-bold text-slate-200 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span>
                    {formatLabel('تلفظ طبیعی', 'Listen Normal')} (
                    <span className="font-mono-num">1.0x</span>)
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="listen-slow-btn"
                  onClick={() => {
                    triggerMicSpectrumPulse(56, 900);
                    speakEnglish(activePhrase.en, 0.65);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400/50 text-xs font-bold text-slate-200 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Gauge className="w-4 h-4 text-emerald-400" />
                  <span>
                    {formatLabel('تلفظ شمرده', 'Listen Slow')} (
                    <span className="font-mono-num">0.65x</span>)
                  </span>
                </button>

              <button
                type="button"
                data-testid="pronunciation-mic-btn"
                onClick={handleToggleMicrophoneSpeech}
                className={`px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  isRecording
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-gradient-to-l from-emerald-400 to-cyan-400 text-slate-950 hover:brightness-110'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>
                      {formatLabel(
                        'در حال دریافت صدا... (توقف)',
                        'Listening... (Stop)'
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>
                      {formatLabel(
                        'شروع تلفظ با میکروفون',
                        'Speak with Microphone'
                      )}
                    </span>
                  </>
                )}
              </button>
              </div>
            </div>

            {isRecording && (
              <div
                data-testid="mic-listening-banner"
                className="px-4 py-2.5 rounded-xl bg-emerald-950/35 border border-emerald-500/35 text-xs text-emerald-200 text-center font-medium"
              >
                {formatLabel(
                  'میکروفون باز است — کلمه یا جمله انگلیسی را با آرامش تلفظ کنید و پس از پایان دکمه توقف را بزنید',
                  'Microphone is open — speak a word or the full sentence naturally, then press Stop when finished'
                )}
              </div>
            )}

            {micNotice && (
              <div
                data-testid="mic-notice-banner"
                className={`px-4 py-2.5 rounded-xl border text-xs font-medium text-center ${
                  micNotice.tone === 'error'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}
              >
                {formatLabel(micNotice.fa, micNotice.en)}
              </div>
            )}

            {/* Live Recognized Speech Input & Quick Test Presets */}
            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="pronunciation-input"
                  className="block text-xs font-semibold text-slate-300"
                >
                  {formatLabel(
                    'متن تشخیص داده‌شده زنده از میکروفون (یا تایپ مستقیم برای تست شاخص):',
                    'Live Speech Recognition Transcript (or type to test confidence meter):'
                  )}
                </label>

                {/* Quick Simulation Presets for testing Green / Yellow / Red feedback states */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap();
                      setRawConfidence(0.98);
                      setSpokenInput(activePhrase.en);
                      triggerMicSpectrumPulse(88, 700);
                      recordAttemptToHistory(
                        activePhrase.en,
                        activePhrase.en,
                        0.98
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/50 cursor-pointer"
                  >
                    {formatLabel('تست سبز (100%)', 'Test Green')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap();
                      setRawConfidence(undefined);
                      const half = targetWords
                        .slice(0, Math.max(1, Math.floor(targetWords.length * 0.55)))
                        .join(' ');
                      setSpokenInput(half);
                      triggerMicSpectrumPulse(64, 700);
                      recordAttemptToHistory(activePhrase.en, half);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-500/40 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/50 cursor-pointer"
                  >
                    {formatLabel('تست زرد (~65%)', 'Test Yellow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap();
                      setRawConfidence(undefined);
                      setSpokenInput('wrong words spoken');
                      triggerMicSpectrumPulse(45, 700);
                      recordAttemptToHistory(
                        activePhrase.en,
                        'wrong words spoken'
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-500/40 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                  >
                    {formatLabel('تست قرمز (<50%)', 'Test Red')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="pronunciation-input"
                  dir="ltr"
                  type="text"
                  value={spokenInput}
                  onChange={(e) => {
                    setSpokenInput(e.target.value);
                    setRawConfidence(undefined);
                  }}
                  placeholder={activePhrase.en}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 font-en text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  data-testid="log-attempt-btn"
                  disabled={!spokenInput.trim()}
                  onClick={() => {
                    if (!spokenInput.trim()) return;
                    soundFX.tap();
                    recordAttemptToHistory(
                      activePhrase.en,
                      spokenInput,
                      rawConfidence
                    );
                  }}
                  className="px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400/50 disabled:opacity-40 text-xs font-bold text-cyan-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{formatLabel('ثبت در نمودار', 'Log Attempt')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Historical Pronunciation Accuracy Trends Chart (Recharts) */}
          <div
            data-testid="pronunciation-history-chart"
            className="obsidian-surface rounded-3xl p-6 sm:p-8 border border-slate-800/90 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    {formatLabel(
                      'نمودار تاریخچه و روند پیشرفت دقت تلفظ',
                      'Historical Pronunciation Accuracy Trend Chart'
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {formatLabel(
                      'تحلیل زمانی تلاش‌های شما با خط هدف تسلط (۸۰٪ سبز)',
                      'Accuracy progression across attempts with 80% fluency target line'
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="reset-history-btn"
                onClick={() => {
                  soundFX.tap();
                  setHistory(DEFAULT_PRONUNCIATION_HISTORY);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatLabel('بازنشانی نمودار', 'Reset History')}</span>
              </button>
            </div>

            {/* 4 KPI Trend Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-950/75 border border-slate-800/80">
                <div className="text-[11px] text-slate-400">
                  {formatLabel('میانگین دقت', 'Avg Accuracy')}
                </div>
                <div
                  dir="ltr"
                  className="font-mono-num text-xl font-black text-white mt-1 inline-block"
                >
                  {trendStats.averageAccuracy}%
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/75 border border-slate-800/80">
                <div className="text-[11px] text-slate-400">
                  {formatLabel('بهترین رکورد', 'Peak Accuracy')}
                </div>
                <div
                  dir="ltr"
                  className="font-mono-num text-xl font-black text-emerald-400 mt-1 inline-block"
                >
                  {trendStats.peakAccuracy}%
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/75 border border-slate-800/80">
                <div className="text-[11px] text-slate-400">
                  {formatLabel('روند پیشرفت', 'Improvement')}
                </div>
                <div
                  dir="ltr"
                  className={`font-mono-num text-xl font-black mt-1 inline-block ${
                    trendStats.improvementDelta >= 0
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                  }`}
                >
                  {trendStats.improvementDelta >= 0
                    ? `+${trendStats.improvementDelta}%`
                    : `${trendStats.improvementDelta}%`}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/75 border border-slate-800/80">
                <div className="text-[11px] text-slate-400">
                  {formatLabel('تلاش‌های ثبت‌شده', 'Logged Attempts')}
                </div>
                <div
                  dir="ltr"
                  className="font-mono-num text-xl font-black text-slate-100 mt-1 inline-block"
                >
                  {trendStats.totalAttempts}{' '}
                  <span className="text-xs text-emerald-400 font-semibold">
                    ({trendStats.greenCount} ✓)
                  </span>
                </div>
              </div>
            </div>

            {/* Recharts Area + Line Historical Trend Visualization */}
            <div
              dir="ltr"
              className="w-full h-64 pt-2 rounded-2xl bg-slate-950/60 border border-slate-800/80 p-3"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={history}
                  margin={{ top: 12, right: 18, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="accuracyAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.42}
                      />
                      <stop
                        offset="55%"
                        stopColor="#06b6d4"
                        stopOpacity={0.16}
                      />
                      <stop
                        offset="95%"
                        stopColor="#06b6d4"
                        stopOpacity={0.0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestampLabel"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#1e293b' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 80, 100]}
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#1e293b' }}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#090D16',
                      borderColor: '#1e293b',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) => [
                      `${Number(value ?? 0)}%`,
                      formatLabel('دقت تلفظ', 'Accuracy'),
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as
                        | PronunciationAttemptRecord
                        | undefined;
                      const attemptPrefix = formatLabel('تلاش', 'Attempt');
                      return item
                        ? `${attemptPrefix} ${label}: "${item.phraseEn}"`
                        : `${attemptPrefix} ${label}`;
                    }}
                  />
                  <ReferenceLine
                    y={80}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: formatLabel('۸۰٪ هدف تسلط', '80% Fluent Target'),
                      position: 'insideTopRight',
                      fill: '#34d399',
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={50}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    label={{
                      value: formatLabel('۵۰٪ متوسط', '50% Fair'),
                      position: 'insideBottomRight',
                      fill: '#fbbf24',
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke="none"
                    fill="url(#accuracyAreaGrad)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    dot={{
                      r: 5,
                      fill: '#10b981',
                      stroke: '#090D16',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 7,
                      fill: '#22d3ee',
                      stroke: '#ffffff',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
