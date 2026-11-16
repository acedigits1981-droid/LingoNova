import React from 'react';
import { Award, Flame, PartyPopper, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { CurriculumUnit, UserProgress } from '../types/curriculum';
import { DailyMilestoneState } from '../utils/lessonEngine';
import { soundFX } from '../utils/soundEngine';
import { UiLanguageMode } from './PronunciationLabView';

interface LeagueStandingMember {
  id: string;
  name: string;
  xp: number;
  isUser: boolean;
}

interface LeagueHubViewProps {
  progress: UserProgress;
  units: CurriculumUnit[];
  dailyMilestone: DailyMilestoneState;
  leagueStandings: LeagueStandingMember[];
  totalVocabularyCount: number;
  onBoostDailyXp: (amount: number) => void;
  onReplayConfetti: () => void;
  onSetDailyGoal: (goal: number) => void;
  uiLang?: UiLanguageMode;
}

export const LeagueHubView: React.FC<LeagueHubViewProps> = ({
  progress,
  units,
  dailyMilestone,
  leagueStandings,
  totalVocabularyCount,
  onBoostDailyXp,
  onReplayConfetti,
  onSetDailyGoal,
  uiLang = 'fa',
}) => {
  const formatLabel = (fa: string, en: string) => (uiLang === 'en' ? en : fa);

  const quests = [
    {
      title: formatLabel('تکمیل ۱ درس کامل', 'Complete 1 Full Lesson'),
      current: Math.min(1, progress.lessonsCompletedToday),
      target: 1,
      xp: '+25 XP',
    },
    {
      title: formatLabel('کسب ۲۵۰ امتیاز تجربه کل', 'Reach 250 Total XP'),
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
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
          {formatLabel('لیگ هفتگی، جوایز و دستاورد روزانه', 'League, Quests & Daily Milestone')}
        </h1>
        <p className="text-sm text-slate-400">
          {formatLabel(
            'روند استریک روزانه، ماموریت‌ها و جایگاه خود در لیگ الماس را دنبال کنید',
            'Track your daily XP streak milestone, quests, and weekly Diamond League standing'
          )}
        </p>
      </div>

      {/* Top 3 KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="obsidian-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Flame className="w-5 h-5 fill-amber-400" />
          </div>
          <div>
            <div className="font-mono-num text-2xl font-black text-white">
              {progress.streak}
            </div>
            <div className="text-xs text-slate-400">
              {formatLabel('روز متوالی استریک', 'Day Streak')}
            </div>
          </div>
        </div>

        <div className="obsidian-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Zap className="w-5 h-5 fill-cyan-400" />
          </div>
          <div>
            <div className="font-mono-num text-2xl font-black text-white">
              {progress.xp} XP
            </div>
            <div className="text-xs text-slate-400">
              {formatLabel('امتیاز تجربه کل', 'Total XP Earned')}
            </div>
          </div>
        </div>

        <div className="obsidian-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="font-mono-num text-2xl font-black text-white">
              {progress.masteredWordIds.length}/{totalVocabularyCount}
            </div>
            <div className="text-xs text-slate-400">
              {formatLabel(
                `${progress.completedUnitIds.length} از ${units.length} یونیت تکمیل شده`,
                `${progress.completedUnitIds.length} of ${units.length} Units Completed`
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Daily Milestone + Quests */}
        <div className="lg:col-span-6 space-y-6">
          <section className="obsidian-surface rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
                  {dailyMilestone.isCompleted ? (
                    <PartyPopper className="w-4 h-4 text-emerald-300" />
                  ) : (
                    <Trophy className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    {formatLabel('دستاورد روزانه', 'Daily Milestone')}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {formatLabel('هدف استریک XP امروز', 'Daily XP Streak Goal')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                {[30, 50, 100].map((goalVal) => (
                  <button
                    key={goalVal}
                    type="button"
                    onClick={() => {
                      soundFX.tap();
                      onSetDailyGoal(goalVal);
                    }}
                    className={`px-2.5 py-1 rounded-md font-mono-num text-xs font-bold cursor-pointer ${
                      dailyMilestone.dailyXpGoal === goalVal
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {goalVal}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono-num">
                <span className="font-extrabold text-white">
                  {dailyMilestone.dailyXpEarned} / {dailyMilestone.dailyXpGoal} XP
                </span>
                <span className="text-cyan-300 font-bold">
                  {dailyMilestone.percentage}%
                </span>
              </div>
              <div
                dir="ltr"
                className="w-full h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden p-0.5"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.max(6, dailyMilestone.percentage)}%` }}
                />
              </div>
            </div>

            {dailyMilestone.isCompleted ? (
              <button
                type="button"
                onClick={onReplayConfetti}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <PartyPopper className="w-4 h-4 text-amber-300" />
                <span>
                  {formatLabel('پخش مجدد جشن کانفتی', 'Replay Confetti Celebration')}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onBoostDailyXp(15)}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  {formatLabel('ثبت مرور روزانه (+15 XP)', 'Daily Check-In (+15 XP)')}
                </span>
              </button>
            )}
          </section>

          <section className="obsidian-surface rounded-3xl p-6 space-y-4">
            <h2 className="text-base font-extrabold text-white inline-flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>{formatLabel('اهداف روزانه', 'Daily Quests')}</span>
            </h2>
            <div className="space-y-4">
              {quests.map((q, idx) => {
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
        </div>

        {/* Right: Diamond League Leaderboard */}
        <section className="lg:col-span-6 obsidian-surface rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white inline-flex items-center gap-2">
              <Award className="w-4 h-4 text-cyan-400" />
              <span>{formatLabel('لیگ هفتگی الماس', 'Diamond League')}</span>
            </h2>
            <span className="text-xs text-slate-400">
              {formatLabel('رتبهبندی زنده', 'Live Standings')}
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {leagueStandings.map((member, idx) => (
              <div
                key={member.id}
                className={`py-3.5 px-3 rounded-xl flex items-center justify-between text-sm ${
                  member.isUser
                    ? 'bg-cyan-500/10 text-cyan-200 font-bold'
                    : 'text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono-num w-6 text-slate-400 font-bold">
                    0{idx + 1}
                  </span>
                  <span>{member.name}</span>
                </div>
                <span className="font-mono-num font-bold text-slate-100">
                  {member.xp} XP
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
