import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  Zap,
  Volume2,
  VolumeX,
  BookOpen,
  Play,
  Check,
  Award,
  Target,
  RotateCcw,
  Mic,
  Languages,
  Trophy,
  Sparkles,
  PartyPopper,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
} from 'lucide-react';
import { INITIAL_UNITS } from './data/curriculum';
import { CurriculumUnit, UserProgress } from './types/curriculum';
import {
  applyDailyXpProgress,
  DAILY_XP_GOAL_DEFAULT,
  getDailyMilestoneState,
  getTodayIsoDate,
} from './utils/lessonEngine';
import {
  getSelectedVoice,
  setSelectedVoice,
  soundFX,
  speakEnglish,
  stopAllSpeech,
} from './utils/soundEngine';
import {
  HUMAN_VOICE_PRESETS,
  HumanVoiceId,
} from './utils/ttsHelpers';
import {
  ParticleCanvas,
  triggerConfettiCelebration,
} from './components/ParticleCanvas';
import { TopBar, AppSection } from './components/TopBar';
import { FlashcardModal } from './components/FlashcardModal';
import { LessonArena } from './components/LessonArena';
import { PracticeHubView } from './components/PracticeHubView';
import { LeagueHubView } from './components/LeagueHubView';
import { CheckpointTestModal } from './components/CheckpointTestModal';
import { AlphabetMiniStrip } from './components/AlphabetMiniStrip';
import {
  PronunciationLabView,
  UiLanguageMode,
} from './components/PronunciationLabView';
import { JsonStudioView } from './components/JsonStudioView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

const STORAGE_KEY = 'lingonova_prod_v1';

const DEFAULT_PROGRESS: UserProgress = {
  xp: 180,
  streak: 4,
  completedUnitIds: [],
  masteredWordIds: ['w_hello'],
  lessonsCompletedToday: 0,
  perfectLessonsCount: 0,
  wordsReviewedToday: 1,
  dailyXpEarned: 35,
  dailyXpGoal: DAILY_XP_GOAL_DEFAULT,
  dailyMilestoneDate: getTodayIsoDate(),
};

function loadInitialProgress(): UserProgress {
  if (typeof window === 'undefined') return DEFAULT_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<UserProgress>;
    const today = getTodayIsoDate();
    const isSameDay = !parsed.dailyMilestoneDate || parsed.dailyMilestoneDate === today;
    return {
      xp: typeof parsed.xp === 'number' ? parsed.xp : DEFAULT_PROGRESS.xp,
      streak:
        typeof parsed.streak === 'number' ? parsed.streak : DEFAULT_PROGRESS.streak,
      completedUnitIds: Array.isArray(parsed.completedUnitIds)
        ? parsed.completedUnitIds
        : [],
      masteredWordIds: Array.isArray(parsed.masteredWordIds)
        ? parsed.masteredWordIds
        : DEFAULT_PROGRESS.masteredWordIds,
      lessonsCompletedToday:
        typeof parsed.lessonsCompletedToday === 'number'
          ? parsed.lessonsCompletedToday
          : 0,
      perfectLessonsCount:
        typeof parsed.perfectLessonsCount === 'number'
          ? parsed.perfectLessonsCount
          : 0,
      wordsReviewedToday:
        typeof parsed.wordsReviewedToday === 'number'
          ? parsed.wordsReviewedToday
          : 1,
      dailyXpEarned: isSameDay
        ? typeof parsed.dailyXpEarned === 'number'
          ? parsed.dailyXpEarned
          : DEFAULT_PROGRESS.dailyXpEarned
        : 0,
      dailyXpGoal:
        typeof parsed.dailyXpGoal === 'number' && parsed.dailyXpGoal > 0
          ? parsed.dailyXpGoal
          : DAILY_XP_GOAL_DEFAULT,
      dailyMilestoneDate: today,
      dailyMilestoneCelebratedDate: parsed.dailyMilestoneCelebratedDate,
      passedCheckpointIds: Array.isArray(parsed.passedCheckpointIds)
        ? parsed.passedCheckpointIds
        : [],
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export default function App() {
  const [units, setUnits] = useState<CurriculumUnit[]>(INITIAL_UNITS);
  const [progress, setProgress] = useState<UserProgress>(loadInitialProgress);
  const [activeSection, setActiveSection] = useState<AppSection>('path');
  const [levelFilter, setLevelFilter] = useState<
    'ALL' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  >('ALL');
  const [uiLang, setUiLang] = useState<UiLanguageMode>('fa');
  const [selectedVoice, setSelectedVoiceState] = useState<HumanVoiceId>(
    getSelectedVoice
  );
  const [muted, setMuted] = useState(false);
  const [milestoneBannerActive, setMilestoneBannerActive] = useState(false);
  const [expandedPreviewUnitIds, setExpandedPreviewUnitIds] = useState<string[]>([]);
  const [speakingUnitId, setSpeakingUnitId] = useState<string | null>(null);
  const dailyMilestoneRef = useRef<HTMLDivElement | null>(null);

  // Modal / Arena states
  const [flashcardUnitId, setFlashcardUnitId] = useState<string | null>(null);
  const [activeLessonUnitId, setActiveLessonUnitId] = useState<string | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState<
    { mode: 'unit'; unit: CurriculumUnit } | { mode: 'final' } | null
  >(null);

  const formatLabel = (fa: string, en: string) => {
    return uiLang === 'en' ? en : fa;
  };

  const launchMilestoneConfetti = () => {
    soundFX.complete();
    setMilestoneBannerActive(true);
    const rect = dailyMilestoneRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      triggerConfettiCelebration(rect.left + rect.width / 2, rect.top + 40, 120);
    } else {
      triggerConfettiCelebration(window.innerWidth * 0.5, window.innerHeight * 0.35, 120);
    }
  };

  const awardDailyXp = (amount: number, extraPatch?: (prev: UserProgress) => Partial<UserProgress>) => {
    let shouldCelebrate = false;
    setProgress((prev) => {
      const merged: UserProgress = extraPatch
        ? { ...prev, ...extraPatch(prev) }
        : prev;
      const { nextProgress, justCompletedMilestone } = applyDailyXpProgress(
        merged,
        amount
      );
      if (justCompletedMilestone) {
        shouldCelebrate = true;
      }
      return nextProgress;
    });
    setTimeout(() => {
      if (shouldCelebrate) {
        launchMilestoneConfetti();
      }
    }, 40);
  };

  // Save progress to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore storage quota errors
    }
  }, [progress]);

  // Cursor spotlight tracking for obsidian cards
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cards = document.querySelectorAll<HTMLElement>('.spotlight-surface');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Support ?autostart=1 and ?section=pronunciation query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setActiveLessonUnitId(INITIAL_UNITS[0].unitId);
    } else if (params.get('section') === 'pronunciation') {
      setActiveSection('pronunciation');
    }
  }, []);

  const handleSelectVoice = (voice: HumanVoiceId) => {
    soundFX.tap();
    setSelectedVoiceState(voice);
    setSelectedVoice(voice);
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundFX.muted = next;
    setMuted(next);
    if (next) {
      stopAllSpeech();
    }
  };

  const handleTogglePreviewWords = (unitId: string) => {
    soundFX.tap();
    setExpandedPreviewUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const handleToggleMasteredWord = (wordId: string) => {
    const exists = progress.masteredWordIds.includes(wordId);
    awardDailyXp(exists ? 0 : 5, (prev) => ({
      masteredWordIds: exists
        ? prev.masteredWordIds.filter((id) => id !== wordId)
        : [...prev.masteredWordIds, wordId],
      wordsReviewedToday: prev.wordsReviewedToday + 1,
    }));
  };

  const handleLessonCompleted = (stats: {
    unitId: string;
    earnedXp: number;
    accuracy: number;
    durationSec: number;
    perfect: boolean;
  }) => {
    awardDailyXp(stats.earnedXp, (prev) => {
      const alreadyDone = prev.completedUnitIds.includes(stats.unitId);
      return {
        completedUnitIds: alreadyDone
          ? prev.completedUnitIds
          : [...prev.completedUnitIds, stats.unitId],
        lessonsCompletedToday: prev.lessonsCompletedToday + 1,
        perfectLessonsCount: stats.perfect
          ? prev.perfectLessonsCount + 1
          : prev.perfectLessonsCount,
      };
    });
  };

  const handleAddOrUpdateUnit = (newUnit: CurriculumUnit) => {
    setUnits((prev) => {
      const idx = prev.findIndex((u) => u.unitId === newUnit.unitId);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = newUnit;
        return copy;
      }
      return [...prev, { ...newUnit, order: prev.length + 1 }];
    });
  };

  const handleCheckpointCompleted = (result: {
    checkpointId: string;
    passed: boolean;
    earnedXp: number;
    percentage: number;
  }) => {
    awardDailyXp(result.earnedXp, (prev) => {
      if (!result.passed) return {};
      const existing = prev.passedCheckpointIds ?? [];
      return {
        passedCheckpointIds: existing.includes(result.checkpointId)
          ? existing
          : [...existing, result.checkpointId],
      };
    });
  };

  const handleOpenUnitCheckpoint = (unitId: string) => {
    const target = units.find((u) => u.unitId === unitId);
    if (!target) return;
    setActiveLessonUnitId(null);
    setFlashcardUnitId(null);
    setActiveCheckpoint({ mode: 'unit', unit: target });
  };

  const handleOpenFinalExam = () => {
    setActiveLessonUnitId(null);
    setFlashcardUnitId(null);
    setActiveCheckpoint({ mode: 'final' });
  };

  const nextRecommendedUnit = useMemo(() => {
    return (
      units.find((u) => !progress.completedUnitIds.includes(u.unitId)) ?? units[0]
    );
  }, [units, progress.completedUnitIds]);

  const filteredUnits = useMemo(() => {
    if (levelFilter === 'ALL') return units;
    return units.filter((u) => u.level === levelFilter);
  }, [units, levelFilter]);

  const activeFlashcardUnit = useMemo(() => {
    if (!flashcardUnitId) return null;
    if (flashcardUnitId === '__all__') {
      const allWords = units.flatMap((u) => u.words);
      return {
        ...units[0],
        unitId: units[0]?.unitId ?? 'unit-1',
        titleFa: 'مرور ترکیبی همه واژگان',
        titleEn: 'All-Course Vocabulary Shuffle',
        words: allWords,
      };
    }
    return units.find((u) => u.unitId === flashcardUnitId) ?? null;
  }, [units, flashcardUnitId]);

  const activeLessonUnit = useMemo(
    () => units.find((u) => u.unitId === activeLessonUnitId) ?? null,
    [units, activeLessonUnitId]
  );

  const totalVocabularyCount = useMemo(
    () => units.reduce((sum, u) => sum + u.words.length, 0),
    [units]
  );

  const masteryPercentage = Math.round(
    (progress.completedUnitIds.length / Math.max(1, units.length)) * 100
  );

  const dailyMilestone = useMemo(
    () => getDailyMilestoneState(progress),
    [progress]
  );

  // League standings sorted dynamically with user's live XP
  const leagueStandings = useMemo(() => {
    const rivals = [
      { id: 'r1', name: formatLabel('آرمان رضایی', 'Arman R.'), xp: 310, isUser: false },
      { id: 'r2', name: formatLabel('نیلوفر کاظمی', 'Niloufar K.'), xp: 245, isUser: false },
      {
        id: 'user',
        name: formatLabel('شما (زبانآموز فعال)', 'You (Active Learner)'),
        xp: progress.xp,
        isUser: true,
      },
      { id: 'r3', name: formatLabel('کیوان محمدی', 'Keyvan M.'), xp: 165, isUser: false },
      { id: 'r4', name: formatLabel('سارا احمدی', 'Sara A.'), xp: 120, isUser: false },
    ];
    return rivals.sort((a, b) => b.xp - a.xp);
  }, [progress.xp, uiLang]);

  return (
    <div
      dir={uiLang === 'en' ? 'ltr' : 'rtl'}
      className="min-h-screen bg-[#070A10] bg-architectural-grid text-slate-100 flex flex-col"
    >
      <ParticleCanvas />

      {/* Unified Sticky Top Navigation + Dual-Language & Microphone Bar */}
      <div className="sticky top-0 z-40">
        <TopBar
          activeSection={activeSection}
          uiLang={uiLang}
          onSelectSection={(sec) => {
            setFlashcardUnitId(null);
            setActiveLessonUnitId(null);
            setActiveCheckpoint(null);
            setActiveSection(sec);
          }}
          onQuickStartLesson={() => {
            setFlashcardUnitId(null);
            setActiveCheckpoint(null);
            setActiveLessonUnitId(nextRecommendedUnit.unitId);
          }}
        />

        {/* Language Mode & Microphone Control Bar */}
        <div className="border-b border-slate-900 bg-[#090D15]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Language Switcher (Farsi Only / English Only) */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
              <Languages className="w-4 h-4 text-cyan-400" />
              <span>{formatLabel('زبان رابط:', 'UI Language:')}</span>
            </span>
            <div
              role="tablist"
              aria-label={formatLabel('انتخاب زبان رابط کاربری', 'Interface Language Tabs')}
              data-testid="ui-language-tabs"
              className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800"
            >
              {(
                [
                  { id: 'fa', label: 'فارسی (FA)' },
                  { id: 'en', label: 'English (EN)' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={uiLang === mode.id}
                  data-testid={`lang-tab-${mode.id}`}
                  onClick={() => {
                    soundFX.tap();
                    setUiLang(mode.id);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uiLang === mode.id
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Humanized Voice Coach & Audio Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-semibold">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">
                {formatLabel('گوینده:', 'Voice:')}
              </span>
              <select
                data-testid="voice-coach-select"
                aria-label={formatLabel('انتخاب صدای طبیعی گوینده', 'Select Humanized Coach Voice')}
                value={selectedVoice}
                onChange={(e) => handleSelectVoice(e.target.value as HumanVoiceId)}
                className="bg-transparent text-cyan-200 font-semibold focus:outline-none cursor-pointer"
              >
                {HUMAN_VOICE_PRESETS.map((preset) => (
                  <option
                    key={preset.id}
                    value={preset.id}
                    className="bg-slate-900 text-slate-100"
                  >
                    {uiLang === 'en' ? preset.nameEn : preset.nameFa}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              aria-label={
                muted
                  ? formatLabel('فعال کردن صدا', 'Unmute Audio')
                  : formatLabel('بیصدا کردن', 'Mute Audio')
              }
              onClick={handleToggleMute}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/40 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  <span>{formatLabel('صدا خاموش', 'Audio Muted')}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{formatLabel('صدا فعال', 'Audio On')}</span>
                </>
              )}
            </button>

            <PWAInstallButton uiLang={uiLang} />
          </div>
        </div>
        </div>
      </div>

      <OfflineIndicator uiLang={uiLang} />

      {/* Active Lesson / Flashcard / Checkpoint Test Full View */}
      {activeCheckpoint ? (
        <main className="flex-1">
          <CheckpointTestModal
            mode={activeCheckpoint.mode}
            unit={activeCheckpoint.mode === 'unit' ? activeCheckpoint.unit : undefined}
            units={units}
            onClose={() => setActiveCheckpoint(null)}
            onTestCompleted={handleCheckpointCompleted}
            uiLang={uiLang}
          />
        </main>
      ) : activeLessonUnit ? (
        <main className="flex-1">
          <LessonArena
            unit={activeLessonUnit}
            onExit={() => setActiveLessonUnitId(null)}
            onLessonCompleted={handleLessonCompleted}
            onStartUnitCheckpoint={handleOpenUnitCheckpoint}
            uiLang={uiLang}
          />
        </main>
      ) : activeFlashcardUnit ? (
        /* Active Flashcard Studio View */
        <main className="flex-1">
          <FlashcardModal
            unit={activeFlashcardUnit}
            masteredWordIds={progress.masteredWordIds}
            onToggleMasteredWord={handleToggleMasteredWord}
            onClose={() => setFlashcardUnitId(null)}
            onStartUnitLesson={(uId) => {
              setFlashcardUnitId(null);
              setActiveLessonUnitId(uId);
            }}
            uiLang={uiLang}
          />
        </main>
      ) : activeSection === 'practice' ? (
        <main className="flex-1">
          <PracticeHubView
            units={units}
            masteredWordIds={progress.masteredWordIds}
            completedUnitIds={progress.completedUnitIds}
            passedCheckpointIds={progress.passedCheckpointIds ?? []}
            onToggleMasteredWord={handleToggleMasteredWord}
            onOpenFlashcards={(uId) => setFlashcardUnitId(uId)}
            onOpenAllFlashcards={() => setFlashcardUnitId('__all__')}
            onStartUnitCheckpoint={handleOpenUnitCheckpoint}
            onStartFinalExam={handleOpenFinalExam}
            onEarnPracticeXp={(amt) => awardDailyXp(amt)}
            uiLang={uiLang}
          />
        </main>
      ) : activeSection === 'leaderboard' ? (
        <main className="flex-1">
          <LeagueHubView
            progress={progress}
            units={units}
            dailyMilestone={dailyMilestone}
            leagueStandings={leagueStandings}
            totalVocabularyCount={totalVocabularyCount}
            onBoostDailyXp={(amt) => awardDailyXp(amt)}
            onReplayConfetti={launchMilestoneConfetti}
            onSetDailyGoal={(goalVal) =>
              setProgress((prev) => ({ ...prev, dailyXpGoal: goalVal }))
            }
            uiLang={uiLang}
          />
        </main>
      ) : activeSection === 'pronunciation' ? (
        <main className="flex-1">
          <PronunciationLabView
            units={units}
            uiLang={uiLang}
            selectedVoice={selectedVoice}
            onSelectVoice={handleSelectVoice}
            onEarnPracticeXp={(amt) => awardDailyXp(amt)}
            initialUnitId={speakingUnitId}
          />
        </main>
      ) : activeSection === 'json_studio' ? (
        <main className="flex-1">
          <JsonStudioView
            units={units}
            onAddOrUpdateUnit={handleAddOrUpdateUnit}
            onStartUnitLesson={(uId) => setActiveLessonUnitId(uId)}
            uiLang={uiLang}
          />
        </main>
      ) : (
        /* Main Learning Path & Telemetry Two-Zone Sandbox (Duolingo / Babbel Guided Flow) */
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Primary Column (8 Cols): Active Unit Banner + Level Filter + Guided Stepping Stones */}
            <div className="lg:col-span-8 space-y-6">
              {/* Active Unit "Up Next" Guided Banner */}
              <section
                data-testid="active-unit-banner"
                className="obsidian-surface spotlight-surface rounded-3xl p-6 sm:p-7"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-3 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-300 font-semibold">
                      <span>{formatLabel('قدم بعدی شما', 'Up Next')}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatLabel('یونیت', 'Unit')}{' '}
                        <span className="font-mono-num">{nextRecommendedUnit.order}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatLabel('سطح', 'Level')} {nextRecommendedUnit.level}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num text-emerald-400">
                        +{nextRecommendedUnit.xpReward} XP
                      </span>
                    </div>

                    <h1
                      className="text-2xl sm:text-3xl font-black text-white leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      {uiLang === 'en'
                        ? nextRecommendedUnit.titleEn
                        : nextRecommendedUnit.titleFa}
                    </h1>

                    <p className="text-sm text-slate-400 leading-relaxed">
                      {uiLang === 'en'
                        ? `Master ${nextRecommendedUnit.words.length} essential words first, then breeze through ${nextRecommendedUnit.exercises.length} interactive steps.`
                        : `${nextRecommendedUnit.subtitleFa} — ابتدا واژگان را مرور کنید و سپس وارد ${nextRecommendedUnit.exercises.length} تمرین کوتاه شوید.`}
                    </p>

                    {/* Course Mastery Slim Progress Bar */}
                    <div className="pt-1 space-y-1.5 max-w-sm">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{formatLabel('پیشرفت کل دوره', 'Course Progress')}</span>
                        <span className="font-mono-num text-cyan-300 font-bold">
                          {progress.completedUnitIds.length}/{units.length} ({masteryPercentage}%)
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                          style={{ width: `${Math.max(8, masteryPercentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 shrink-0">
                    <button
                      type="button"
                      data-testid="hero-continue-btn"
                      onClick={() => {
                        soundFX.select();
                        setActiveLessonUnitId(nextRecommendedUnit.unitId);
                      }}
                      className="cta-emerald px-6 py-3.5 rounded-2xl text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>
                        {formatLabel('ادامه درس فعلی', 'Continue Lesson')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.tap();
                        setFlashcardUnitId(nextRecommendedUnit.unitId);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-400/40 text-xs font-semibold text-slate-200 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4 text-cyan-400" />
                      <span>
                        {formatLabel('مرور سریع فلشکارت‌ها', 'Study Flashcards')}
                      </span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Level Filter Bar & Path Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div>
                  <h2 className="text-lg font-extrabold text-white">
                    {formatLabel(
                      `مسیر گام‌به‌گام یادگیری (${filteredUnits.length} یونیت)`,
                      `Guided Learning Path (${filteredUnits.length} Units)`
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {formatLabel(
                      'در هر یونیت به ترتیب: ۱. واژگان ← ۲. درس تعاملی ← ۳. تمرین مکالمه',
                      'Follow 3 clear steps per unit: 1. Key Words → 2. Interactive Lesson → 3. Speak Practice'
                    )}
                  </p>
                </div>

                {/* Segmented Level Filter Buttons (Complete CEFR A1–C2) */}
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start">
                  {(
                    [
                      { id: 'ALL', label: formatLabel('همه سطوح', 'All Levels') },
                      { id: 'A1', label: 'A1' },
                      { id: 'A2', label: 'A2' },
                      { id: 'B1', label: 'B1' },
                      { id: 'B2', label: 'B2' },
                      { id: 'C1', label: 'C1' },
                      { id: 'C2', label: 'C2' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`level-filter-${tab.id}`}
                      onClick={() => {
                        soundFX.tap();
                        setLevelFilter(tab.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        levelFilter === tab.id
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compact Collapsible A-Z Alphabet Drawer ("somewhere small") */}
              <AlphabetMiniStrip uiLang={uiLang} defaultExpanded={false} />

              {/* Guided Stepping-Stone Unit Cards */}
              <div className="space-y-4">
                {filteredUnits.map((unit) => {
                  const isCompleted = progress.completedUnitIds.includes(unit.unitId);
                  const isRecommended = unit.unitId === nextRecommendedUnit.unitId;
                  const masteredCount = unit.words.filter((w) =>
                    progress.masteredWordIds.includes(w.id)
                  ).length;
                  const isWordsExpanded = expandedPreviewUnitIds.includes(unit.unitId);

                  return (
                    <article
                      key={unit.unitId}
                      data-testid={`unit-card-${unit.unitId}`}
                      className={`obsidian-surface spotlight-surface rounded-3xl p-6 transition-transform duration-200 ${
                        isRecommended ? 'border-cyan-400/40' : ''
                      }`}
                    >
                      {/* Clean Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            <div
                              className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${unit.accentGradient} p-[1.5px]`}
                            >
                              <div className="w-full h-full rounded-[14.5px] bg-[#090D16] flex items-center justify-center text-xl select-none">
                                {unit.badgeIcon}
                              </div>
                            </div>
                            {isCompleted && (
                              <div
                                title={formatLabel('تکمیل شده', 'Completed')}
                                className="-bottom-1 -left-1 absolute w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="text-cyan-300 font-semibold">
                                {formatLabel('یونیت', 'Unit')}{' '}
                                <span className="font-mono-num">{unit.order}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {formatLabel('سطح', 'Level')} {unit.level}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num text-emerald-400 font-semibold">
                                +{unit.xpReward} XP
                              </span>
                              {isCompleted && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-400 font-semibold">
                                    {formatLabel('تکمیل شد', 'Completed')}
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="text-lg font-extrabold text-white">
                              {uiLang === 'en' ? unit.titleEn : unit.titleFa}
                            </h3>
                            {uiLang === 'fa' && (
                              <p className="text-xs text-slate-400">
                                {unit.subtitleFa}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTogglePreviewWords(unit.unitId)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>
                            {formatLabel(
                              `پیش‌نمایش لغات (${unit.words.length})`,
                              `Preview Words (${unit.words.length})`
                            )}
                          </span>
                          {isWordsExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      </div>

                      {/* 3 Clear Guided Stepping-Stone Nodes */}
                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Step 1: Key Words / Flashcards */}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.tap();
                            setFlashcardUnitId(unit.unitId);
                          }}
                          className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-400/50 text-start transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center shrink-0">
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">
                                {formatLabel('۱. فلشکارت لغات', '1. Key Words')}
                              </div>
                              <div className="text-[11px] font-mono-num text-slate-400">
                                {masteredCount}/{unit.words.length}{' '}
                                {formatLabel('مسلط', 'mastered')}
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Step 2: Interactive Lesson (Primary Recommended Action) */}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.select();
                            setActiveLessonUnitId(unit.unitId);
                          }}
                          className={`p-3 rounded-2xl text-start transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                            isRecommended
                              ? 'cta-emerald text-slate-950'
                              : 'bg-slate-900/90 border border-slate-800 hover:border-emerald-400/50 text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isRecommended
                                  ? 'bg-slate-950/15 text-slate-950'
                                  : 'bg-emerald-500/15 text-emerald-300'
                              }`}
                            >
                              <Play
                                className={`w-4 h-4 ${
                                  isRecommended ? 'fill-slate-950' : ''
                                }`}
                              />
                            </div>
                            <div>
                              <div className="text-xs font-extrabold">
                                {isCompleted
                                  ? formatLabel('۲. تمرین مجدد درس', '2. Practice Again')
                                  : formatLabel('۲. شروع درس', '2. Start Lesson')}
                              </div>
                              <div
                                className={`text-[11px] font-mono-num ${
                                  isRecommended ? 'text-slate-900/80 font-bold' : 'text-slate-400'
                                }`}
                              >
                                {unit.exercises.length} {formatLabel('مرحله', 'steps')}
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Step 3: Speaking Practice */}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.tap();
                            setSpeakingUnitId(unit.unitId);
                            setActiveSection('pronunciation');
                          }}
                          className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-400/50 text-start transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                              <Mic className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">
                                {formatLabel('۳. تمرین مکالمه', '3. Speak Practice')}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {formatLabel('بازخورد زنده صدا', 'Live Coach')}
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Optional Collapsible Word Preview Drawer */}
                      {isWordsExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2" dir="ltr">
                          {unit.words.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => speakEnglish(w.en, 0.94)}
                              title={`${w.fa} (${w.phoneticFa})`}
                              className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs font-en font-semibold text-slate-200 hover:text-cyan-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span>{w.en}</span>
                              {uiLang === 'fa' && (
                                <span className="text-slate-400 font-fa text-[11px]">
                                  ({w.fa})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Final Course Mastery Test Gate */}
              <section
                data-testid="course-final-test-gate"
                className="obsidian-surface rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-amber-400/30"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-amber-300">
                      {formatLabel(
                        `آزمون جامع پایان دوره · ${progress.completedUnitIds.length}/${units.length} درس تکمیل‌شده`,
                        `Final Mastery Exam · ${progress.completedUnitIds.length}/${units.length} Lessons Done`
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white">
                      {progress.completedUnitIds.length >= units.length
                        ? formatLabel(
                            'همه دروس تمام شد — آزمون نهایی آماده است!',
                            'Every Lesson Finished — Take Your Final Mastery Exam!'
                          )
                        : formatLabel(
                            'پس از پایان تمام دروس یا همین حالا خودتان را بسنجید',
                            'Finish All Lessons (or Challenge Anytime) for Your Mastery Test'
                          )}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {formatLabel(
                        `آزمون ${units.length * 2} سؤالی از تمام ${units.length} یونیت (A1 تا C2) با پاداش +100 XP`,
                        `${units.length * 2}-question cumulative exam across A1–C2 (+100 XP on pass)`
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="learn-unit-test-btn"
                    onClick={() => handleOpenUnitCheckpoint(nextRecommendedUnit.unitId)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span>{formatLabel('آزمون همین یونیت', 'Test Current Unit')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="learn-final-exam-btn"
                    onClick={handleOpenFinalExam}
                    className="cta-emerald px-5 py-2.5 rounded-xl text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>{formatLabel('آزمون نهایی دوره', 'Final Exam')}</span>
                  </button>
                </div>
              </section>
            </div>

            {/* Right / Secondary Column (4 Cols): Telemetry, Daily Quests & League */}
            <aside className="lg:col-span-4 space-y-6">
              {/* Learner Telemetry Panel */}
              <section
                data-testid="telemetry-panel"
                className="obsidian-surface rounded-3xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-white">
                    {formatLabel('وضعیت یادگیری شما', 'Learner Telemetry')}
                  </h2>
                </div>

                <div className="grid grid-cols-3 gap-3 py-4 border-y border-slate-800/80 text-center">
                  <div>
                    <div className="inline-flex items-center justify-center gap-1 font-mono-num text-xl font-black text-amber-400">
                      <Flame className="w-4 h-4 fill-amber-400" />
                      <span>{progress.streak}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatLabel('روز متوالی', 'Day Streak')}
                    </div>
                  </div>

                  <div>
                    <div className="inline-flex items-center justify-center gap-1 font-mono-num text-xl font-black text-cyan-300">
                      <Zap className="w-4 h-4 fill-cyan-400" />
                      <span>{progress.xp}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatLabel('امتیاز XP', 'Total XP')}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono-num text-xl font-black text-emerald-400">
                      {progress.masteredWordIds.length}/{totalVocabularyCount}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatLabel('واژگان مسلط', 'Mastered')}
                    </div>
                  </div>
                </div>

                {/* Daily Milestone Section (Celebrates Daily XP Streak Goal with Confetti) */}
                <div
                  ref={dailyMilestoneRef}
                  data-testid="daily-milestone-section"
                  data-completed={dailyMilestone.isCompleted ? 'true' : 'false'}
                  className={`rounded-2xl p-4 border transition-all duration-300 space-y-3 ${
                    dailyMilestone.isCompleted
                      ? `bg-gradient-to-br from-emerald-950/60 via-[#09161E] to-amber-950/30 border-emerald-400/50 shadow-[0_0_24px_rgba(16,185,129,0.18)] ${
                          milestoneBannerActive ? 'ring-2 ring-emerald-400/50' : ''
                        }`
                      : 'bg-slate-950/75 border-slate-800/90'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                          dailyMilestone.isCompleted
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {dailyMilestone.isCompleted ? (
                          <PartyPopper className="w-4 h-4" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-white">
                          {formatLabel('دستاورد روزانه', 'Daily Milestone')}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {formatLabel('هدف استریک XP امروز', 'Daily XP Streak Goal')}
                        </p>
                      </div>
                    </div>

                    {/* Goal Selector (30 / 50 / 100 XP) */}
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                      {[30, 50, 100].map((goalVal) => (
                        <button
                          key={goalVal}
                          type="button"
                          onClick={() => {
                            soundFX.tap();
                            setProgress((prev) => ({
                              ...prev,
                              dailyXpGoal: goalVal,
                            }));
                          }}
                          className={`px-2 py-0.5 rounded-md font-mono-num text-[10px] font-bold transition-colors cursor-pointer ${
                            dailyMilestone.dailyXpGoal === goalVal
                              ? 'bg-cyan-500/20 text-cyan-200'
                              : 'text-slate-500 hover:text-slate-200'
                          }`}
                        >
                          {goalVal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daily XP Progress Readout & Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        dir="ltr"
                        className={`font-mono-num font-extrabold ${
                          dailyMilestone.isCompleted
                            ? 'text-emerald-300'
                            : 'text-slate-200'
                        }`}
                      >
                        {dailyMilestone.dailyXpEarned} / {dailyMilestone.dailyXpGoal} XP
                      </span>
                      <span
                        dir="ltr"
                        className="font-mono-num text-[11px] font-bold text-cyan-300"
                      >
                        {dailyMilestone.percentage}%
                      </span>
                    </div>

                    <div
                      dir="ltr"
                      className="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden p-0.5"
                    >
                      <div
                        data-testid="daily-milestone-bar"
                        className={`h-full rounded-full transition-all duration-300 ${
                          dailyMilestone.isCompleted
                            ? 'bg-gradient-to-r from-emerald-400 via-cyan-300 to-amber-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                            : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                        }`}
                        style={{
                          width: `${Math.max(6, dailyMilestone.percentage)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Celebration Banner vs Progress CTA */}
                  {dailyMilestone.isCompleted ? (
                    <div
                      data-testid="daily-milestone-celebration"
                      className="pt-1 space-y-2.5"
                    >
                      <div className="flex items-start gap-2 text-xs font-bold text-emerald-200 leading-relaxed">
                        <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                        <span>
                          {formatLabel(
                            'تبریک! هدف روزانه استریک XP شما کامل شد و زنجیره یادگیری حفظ گردید!',
                            'Goal Unlocked! You completed your daily XP streak milestone!'
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid="replay-confetti-btn"
                        onClick={() => launchMilestoneConfetti()}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <PartyPopper className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          {formatLabel('پخش مجدد جشن کانفتی', 'Replay Confetti Celebration')}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="pt-1 space-y-2.5">
                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        {formatLabel(
                          `${dailyMilestone.remainingXp} امتیاز XP مانده تا تکمیل استریک و جشن امروز`,
                          `${dailyMilestone.remainingXp} XP remaining to unlock today's streak celebration`
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid="daily-milestone-boost-btn"
                        onClick={() => awardDailyXp(15)}
                        className="w-full py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          {formatLabel('ثبت مرور روزانه (+15 XP)', 'Daily Check-In (+15 XP)')}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {formatLabel(
                      `درسهای امروز: ${progress.lessonsCompletedToday}`,
                      `Today's Lessons: ${progress.lessonsCompletedToday}`
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.tap();
                      setMilestoneBannerActive(false);
                      setProgress(DEFAULT_PROGRESS);
                    }}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{formatLabel('بازنشانی آمار', 'Reset Stats')}</span>
                  </button>
                </div>
              </section>

              {/* Daily Quests Deck */}
              <section className="obsidian-surface rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-white inline-flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span>{formatLabel('اهداف روزانه', 'Daily Quests')}</span>
                  </h2>
                  <span className="text-xs text-slate-400">
                    {formatLabel('بروزرسانی خودکار', 'Auto-Sync')}
                  </span>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      title: formatLabel(
                        'تکمیل ۱ درس کامل',
                        'Complete 1 Full Lesson'
                      ),
                      current: Math.min(1, progress.lessonsCompletedToday),
                      target: 1,
                      xp: '+25 XP',
                    },
                    {
                      title: formatLabel(
                        'کسب ۲۵۰ امتیاز تجربه کل',
                        'Reach 250 Total XP'
                      ),
                      current: Math.min(250, progress.xp),
                      target: 250,
                      xp: '+40 XP',
                    },
                    {
                      title: formatLabel(
                        'تسلط بر ۵ واژه در فلشکارت یا واژهنامه',
                        'Master 5 Vocabulary Words'
                      ),
                      current: Math.min(5, progress.masteredWordIds.length),
                      target: 5,
                      xp: '+30 XP',
                    },
                  ].map((q, idx) => {
                    const pct = Math.round((q.current / q.target) * 100);
                    const done = q.current >= q.target;
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={`font-semibold ${
                              done ? 'text-emerald-300' : 'text-slate-200'
                            }`}
                          >
                            {q.title}
                          </span>
                          <span className="font-mono-num text-slate-400">
                            {q.current}/{q.target} · {q.xp}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              done ? 'bg-emerald-400' : 'bg-cyan-400'
                            }`}
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Weekly Diamond League */}
              <section className="obsidian-surface rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-white inline-flex items-center gap-2">
                    <Award className="w-4 h-4 text-cyan-400" />
                    <span>
                      {formatLabel('لیگ هفتگی الماس', 'Diamond League')}
                    </span>
                  </h2>
                  <span className="text-xs text-slate-400">
                    {formatLabel('رتبهبندی زنده', 'Live Standings')}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {leagueStandings.map((member, idx) => (
                    <div
                      key={member.id}
                      className={`py-2.5 flex items-center justify-between text-xs sm:text-sm ${
                        member.isUser ? 'text-cyan-300 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num w-5 text-slate-500 font-semibold">
                          0{idx + 1}
                        </span>
                        <span>{member.name}</span>
                      </div>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {member.xp} XP
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </main>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="w-full border-t border-slate-900 py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            {formatLabel(
              'LingoNova — پلتفرم دوزبانه آموزش تعاملی زبان انگلیسی',
              'LingoNova — Dual-Language Interactive English Learning Platform'
            )}
          </span>
          <span>
            {formatLabel(
              'پشتیبانی از استاندارد کامل CEFR (سطوح A1 تا C2) و موتور تشخیص گفتار Web Speech',
              'CEFR A1–C2 Curriculum & Real-Time Web Speech Recognition Engine'
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
