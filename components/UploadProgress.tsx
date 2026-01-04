import React from 'react';
import { CheckCircle2, AlertCircle, CloudUpload, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  stage?: string;
  percent?: number;
  detail?: string;
  decksImported?: number;
  isError?: boolean;
  errorMessage?: string;
  onClose?: () => void;
}

export const UploadProgress: React.FC<Props> = ({ isOpen, stage = '', percent = 0, detail = '', decksImported = 0, isError = false, errorMessage = '', onClose }) => {
  if (!isOpen) return null;

  const pct = Math.min(100, Math.max(0, Math.round(percent || 0)));
  const isComplete = stage === 'complete' || pct === 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-xl p-6 shadow-2xl border border-slate-100">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            {isError ? (
              <AlertCircle className="w-8 h-8 text-red-600" />
            ) : isComplete ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            ) : (
              <CloudUpload className="w-8 h-8 text-indigo-600 animate-pulse" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{isError ? 'Import failed' : isComplete ? 'Import complete' : 'Importing...'}</h3>
              <div className="text-xs text-slate-500">{detail || stage}</div>
            </div>

            <div className="mt-3">
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Import progress">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isError ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-indigo-400'}`}
                  style={{ width: `${pct}%`, boxShadow: pct > 0 ? '0 6px 18px rgba(99,102,241,0.15)' : undefined }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-slate-700">{pct}%</div>
                  <div className="text-slate-400">•</div>
                  <div>Decks: <span className="font-medium text-slate-700">{decksImported}</span></div>
                </div>
                {isError ? (
                  <div className="text-red-600 font-medium">{errorMessage}</div>
                ) : isComplete ? (
                  <div className="text-emerald-600 font-medium">Done ✅</div>
                ) : (
                  <div className="text-slate-400">working…</div>
                )}
              </div>
            </div>
          </div>
          {onClose ? (
            <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-700 p-1 rounded-md">
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
