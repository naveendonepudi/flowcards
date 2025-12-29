
import React, { useState } from 'react';
import { Sparkles, Loader2, Stethoscope, ChevronDown, Activity, ShieldCheck } from 'lucide-react';
import { getSmartExplanation } from '../services/aiService';
import { AISettings } from '../types';

interface SmartTutorProps { front: string; back: string; settings: AISettings; }

export const SmartTutor: React.FC<SmartTutorProps> = ({ front, back, settings }) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    setLoading(true);
    const result = await getSmartExplanation(front, back, settings);
    setExplanation(result || "Unable to generate clinical correlation.");
    setLoading(false);
  };

  const getProviderName = () => {
    switch(settings.provider) {
      case 'openai': return 'ChatGPT 4o';
      case 'perplexity': return 'Perplexity Online';
      default: return 'Gemini Pro';
    }
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 mb-12">
      {!explanation && !loading ? (
        <button
          onClick={handleExplain}
          data-tip="Generate AI Clinical Insights"
          className="w-full group relative flex items-center justify-between bg-slate-950 text-white py-6 px-8 rounded-[28px] font-bold shadow-xl shadow-indigo-100/20 active:scale-[0.98] transition-all overflow-hidden border border-slate-800"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(79,70,229,0.3),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
          
          <div className="flex items-center gap-4 z-10">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
              <Stethoscope className="w-6 h-6 text-indigo-300" />
            </div>
            <div className="text-left">
              <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">{getProviderName()} Engine</span>
              <span className="text-base md:text-lg font-black tracking-tight uppercase">Show USMLE Correlation</span>
            </div>
          </div>
          
          <div className="z-10 hidden sm:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 group-hover:border-white/20 transition-all">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">High Yield</span>
          </div>
        </button>
      ) : (
        <div className="bg-white rounded-[40px] p-8 md:p-12 border border-slate-100 shadow-2xl shadow-slate-200/60 w-full overflow-hidden mb-12 relative z-10">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-5 text-slate-800">
              <div className="p-3.5 bg-teal-50 rounded-2xl shadow-inner border border-teal-100/50">
                <ShieldCheck className="w-7 h-7 text-teal-600" />
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-[0.4em] text-teal-500 mb-1">Board-Certified Logic</span>
                <span className="text-xl font-black tracking-tight">Clinical Correlation</span>
              </div>
            </div>
            {!loading && (
              <button 
                onClick={() => setExplanation(null)}
                data-tip="Close explanation"
                className="p-3 bg-slate-50 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 active:scale-90 transition-all"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
            )}
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center py-24">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <Activity className="absolute w-24 h-24 text-teal-50" />
                <Activity className="absolute w-24 h-24 text-teal-500 animate-ecg-scan" />
              </div>
              <p className="text-sm font-black text-slate-400 mt-10 uppercase tracking-[0.3em] text-center">
                Querying {getProviderName()}...<br/>
                <span className="font-bold normal-case opacity-40 tracking-normal mt-2 block text-xs">Accessing External Reasoning Engine</span>
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-700">
              <div className="space-y-10 text-slate-800 font-serif leading-relaxed text-lg pb-12">
                {explanation?.split('\n').map((line, i) => {
                  const isLabel = line.match(/^[1-9]\. |^[A-Z\s/]{4,}:/);
                  if (isLabel) {
                    return (
                      <h4 key={i} className="font-sans text-[11px] font-black text-teal-600 uppercase tracking-[0.3em] pt-8 first:pt-0 border-b border-slate-100 pb-3 mb-6">
                        {line}
                      </h4>
                    );
                  }
                  if (line.trim() === "") return <div key={i} className="h-6" />;
                  return <p key={i} className="mb-4 last:mb-0 leading-[1.9] text-slate-700">{line}</p>;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
