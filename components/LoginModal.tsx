
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  ExternalLink, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Activity, 
  Cpu, 
  Search, 
  Zap, 
  Globe, 
  Box 
} from 'lucide-react';
import { AIProvider, AISettings } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  provider: AIProvider | null;
  onClose: () => void;
  onSuccess: (key: string, endpoint?: string, model?: string) => void;
  settings: AISettings;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, provider, onClose, onSuccess, settings }) => {
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  useEffect(() => {
    if (isOpen && provider) {
      setKey(settings.apiKeys[provider as keyof typeof settings.apiKeys] || "");
      if (provider === 'custom') {
        setEndpoint(settings.customEndpoint || "https://api.deepseek.com/v1");
        setModel(settings.customModel || "deepseek-chat");
      }
      setIsAuthorizing(false);
    }
  }, [isOpen, provider, settings]);

  if (!isOpen || !provider) return null;

  const providerInfo = {
    openai: {
      name: 'OpenAI (ChatGPT)',
      icon: Cpu,
      color: 'indigo',
      link: 'https://platform.openai.com/api-keys',
      description: 'Connect your OpenAI account to use GPT-4o for clinical reasoning.'
    },
    perplexity: {
      name: 'Perplexity AI',
      icon: Search,
      color: 'teal',
      link: 'https://www.perplexity.ai/settings/api',
      description: 'Enable real-time medical research capabilities using Perplexity Sonar.'
    },
    custom: {
      name: 'Custom Provider',
      icon: Globe,
      color: 'slate',
      link: '#',
      description: 'Connect to any OpenAI-compatible API (DeepSeek, OpenRouter, Ollama, etc.)'
    },
    gemini: {
      name: 'Gemini AI',
      icon: Zap,
      color: 'blue',
      link: '#',
      description: 'Gemini integration is active and managed automatically.'
    }
  };

  const info = providerInfo[provider as keyof typeof providerInfo];

  const handleAuthorize = () => {
    if (!key.trim()) return;
    setIsAuthorizing(true);
    setTimeout(() => {
      onSuccess(key, endpoint, model);
      onClose();
      setIsAuthorizing(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        <div className={`p-8 bg-${info.color}-50 flex items-center justify-between border-b border-${info.color}-100`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 bg-white rounded-2xl shadow-sm text-${info.color}-600`}>
              <info.icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 leading-tight">Authorize {info.name}</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Provider Integration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-full transition-colors active:scale-90">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
          {provider === 'gemini' ? (
            <div className="text-center py-10 space-y-4">
              <Zap className="w-16 h-16 text-blue-500 mx-auto animate-pulse" />
              <p className="text-slate-600 font-bold">Gemini is automatically configured for this session.</p>
              <button onClick={onClose} className="px-8 py-4 bg-slate-950 text-white rounded-2xl font-black uppercase tracking-widest">Back to Study</button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <p className="text-slate-600 text-sm font-medium leading-relaxed">{info.description}</p>
                {provider !== 'custom' && (
                  <a href={info.link} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-${info.color}-600 hover:opacity-70 transition-opacity`}>
                    <span>Get your API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {provider === 'custom' && (
                <>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Base URL</label>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500">
                        <Globe className="w-5 h-5" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="https://api.deepseek.com/v1" 
                        value={endpoint} 
                        onChange={(e) => setEndpoint(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl py-4 pl-14 pr-6 text-sm focus:border-indigo-300 focus:bg-white outline-none" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Model ID</label>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500">
                        <Box className="w-5 h-5" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="deepseek-chat" 
                        value={model} 
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl py-4 pl-14 pr-6 text-sm focus:border-indigo-300 focus:bg-white outline-none" 
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secret API Key</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500">
                    <Key className="w-5 h-5" />
                  </div>
                  <input 
                    type={showKey ? "text" : "password"} 
                    placeholder="sk-..." 
                    value={key} 
                    onChange={(e) => setKey(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl py-5 pl-14 pr-14 text-sm font-mono focus:border-indigo-300 focus:bg-white outline-none" 
                  />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-indigo-500">
                    {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[28px] border border-slate-100 flex gap-4">
                <Lock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Security Note</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Your key is only stored on this device. We do not transmit your credentials to our servers.</p>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button onClick={onClose} className="flex-1 py-5 rounded-[24px] text-sm font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-colors">Cancel</button>
                <button 
                  disabled={!key.trim() || isAuthorizing} 
                  onClick={handleAuthorize} 
                  className="flex-[2] py-5 rounded-[24px] bg-slate-900 text-white text-sm font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30"
                >
                  {isAuthorizing ? <Activity className="w-5 h-5 animate-medical-heartbeat" /> : <ShieldCheck className="w-5 h-5" />}
                  <span>{isAuthorizing ? 'Authorizing...' : 'Save & Connect'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
