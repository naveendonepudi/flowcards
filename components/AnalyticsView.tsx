
import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, Calendar, Flame, TrendingUp, Trophy, ArrowLeft, CheckCircle2, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { StudyLog, AnkiDeck } from '../types';
import { getStudyLogs } from '../services/db';

interface AnalyticsViewProps {
  username: string;
  decks: AnkiDeck[];
  onBack: () => void;
}

interface DayData {
  date: string;
  count: number;
  dayOfMonth: number;
  isPlaceholder: boolean;
  isFuture: boolean;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ username, decks, onBack }) => {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentViewDate, setCurrentViewDate] = useState(new Date());

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await getStudyLogs(username);
      setLogs(data);
      setLoading(false);
    };
    fetchLogs();
  }, [username]);

  const stats = useMemo(() => {
    const totalCards = decks.reduce((acc, d) => acc + d.cards.length, 0);
    const totalStudied = logs.reduce((acc, l) => acc + (l.cardIds?.length || 0), 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const lastMonthLogs = logs.filter(l => new Date(l.date) >= thirtyDaysAgo);
    const monthlyTotal = lastMonthLogs.reduce((acc, l) => acc + (l.cardIds?.length || 0), 0);
    const monthlyAverage = lastMonthLogs.length > 0 ? Math.round(monthlyTotal / 30) : 0;

    let currentStreak = 0;
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const logDates = new Set(logs.map(l => l.date));
    let checkDate = logDates.has(todayStr) ? todayStr : (logDates.has(yesterdayStr) ? yesterdayStr : null);
    
    if (checkDate) {
      let current = new Date(checkDate);
      while (logDates.has(current.toISOString().split('T')[0])) {
        currentStreak++;
        current.setDate(current.getDate() - 1);
      }
    }

    const viewYear = currentViewDate.getFullYear();
    const viewMonth = currentViewDate.getMonth();
    const monthDays: DayData[] = [];
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    
    const startPadding = firstDayOfMonth.getDay();
    for (let p = 0; p < startPadding; p++) { monthDays.push({ date: '', count: 0, dayOfMonth: 0, isPlaceholder: true, isFuture: false }); }

    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
      const dateObj = new Date(viewYear, viewMonth, d);
      const dateStr = dateObj.toISOString().split('T')[0];
      const log = logs.find(l => l.date === dateStr);
      const isFuture = dateObj > today;
      monthDays.push({ date: dateStr, count: log ? (log.cardIds?.length || 0) : 0, dayOfMonth: d, isPlaceholder: false, isFuture });
    }

    const monthName = currentViewDate.toLocaleString('default', { month: 'long' });
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

    return { totalCards, totalStudied, monthlyTotal, monthlyAverage, currentStreak, monthName, viewYear, monthDays, isCurrentMonth, todayStr };
  }, [logs, decks, currentViewDate]);

  const handlePrevMonth = () => { setCurrentViewDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; }); };
  const handleNextMonth = () => { if (stats.isCurrentMonth) return; setCurrentViewDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; }); };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4"><TrendingUp className="w-12 h-12 text-slate-900 animate-pulse" /><span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Syncing Records</span></div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center justify-between"><button onClick={onBack} className="flex items-center gap-3 text-slate-400 font-bold hover:text-slate-950 transition-colors"><ArrowLeft className="w-5 h-5" /> Back to Library</button><div className="text-right"><h2 className="text-2xl font-black tracking-tight text-slate-900">Performance Log</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">User: {username}</p></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Streak', value: `${stats.currentStreak} Days`, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: '30D Total', value: stats.monthlyTotal, icon: CheckCircle2, color: 'text-indigo-500', bg: 'bg-indigo-50' },
          { label: 'Daily Avg', value: stats.monthlyAverage, icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Lifetime', value: stats.totalStudied, icon: Trophy, color: 'text-slate-400', bg: 'bg-slate-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="relative z-10"><div className={`flex items-center gap-2 ${stat.color} mb-2`}><stat.icon className="w-4 h-4 fill-current opacity-70" /><span className="text-[9px] font-black uppercase tracking-widest">{stat.label}</span></div><div className="text-2xl font-black text-slate-900">{stat.value}</div></div>
            <div className={`absolute top-0 right-0 w-16 h-16 ${stat.bg} rounded-full blur-2xl -mr-8 -mt-8 opacity-40 group-hover:scale-150 transition-transform duration-700`} />
          </div>
        ))}
      </div>
      {/* Calendar and Breakdown remain same, just using day.count logic updated above */}
      <div className="bg-white p-8 md:p-10 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4 md:gap-6">
            <button onClick={handlePrevMonth} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-950 hover:bg-slate-100 transition-all active:scale-90"><ChevronLeft className="w-6 h-6" /></button>
            <div className="flex items-center gap-3"><Calendar className="w-6 h-6 text-slate-950" /><h3 className="text-lg md:text-xl font-black text-slate-900 whitespace-nowrap">{stats.monthName} {stats.viewYear}</h3></div>
            {!stats.isCurrentMonth && <button onClick={handleNextMonth} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-950 hover:bg-slate-100 transition-all active:scale-90"><ChevronRight className="w-6 h-6" /></button>}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-3 mb-4">{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => <div key={day} className="text-center text-[10px] font-black text-slate-300 tracking-widest">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-3">{stats.monthDays.map((day, idx) => {
            if (day.isPlaceholder) return <div key={`p-${idx}`} className="aspect-square" />;
            if (day.isFuture) return <div key={day.date} className="relative w-full aspect-square rounded-2xl border border-slate-50 bg-slate-50/30" />;
            let color = 'bg-slate-50 border-slate-100'; let iconColor = 'text-transparent';
            if (day.count > 0 && day.count < 10) { color = 'bg-emerald-100 border-emerald-200'; iconColor = 'text-emerald-500/60'; }
            else if (day.count >= 10 && day.count < 50) { color = 'bg-emerald-300 border-emerald-400 shadow-sm'; iconColor = 'text-white/90'; }
            else if (day.count >= 50) { color = 'bg-emerald-600 border-emerald-700 shadow-md'; iconColor = 'text-white'; }
            return (
              <div key={day.date} className="flex flex-col items-center gap-2 group">
                <div className={`relative w-full aspect-square rounded-2xl border transition-all duration-300 group-hover:scale-110 ${color} flex items-center justify-center overflow-hidden ${day.date === stats.todayStr ? 'ring-2 ring-slate-950 ring-offset-2' : ''}`} title={`${day.date}: ${day.count} cards`}>
                  <span className={`absolute top-1 left-2 text-[8px] font-black ${day.count > 0 ? 'opacity-30' : 'text-slate-300'}`}>{day.dayOfMonth}</span>
                  {day.count > 0 && <Flame className={`w-6 h-6 md:w-8 md:h-8 fill-current ${iconColor} transition-transform group-hover:scale-110 duration-300`} />}
                </div>
              </div>
            );
        })}</div>
      </div>
    </div>
  );
};
