import React, { useState } from 'react';
import { 
  Search, 
  Sparkles, 
  Compass, 
  HelpCircle, 
  X, 
  ChevronRight, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

export default function SpotlightBar({ onAskQuestion, isAsking, result, onClearResult }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('descriptive'); // 'descriptive' or 'analytical'
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    onAskQuestion(query.trim(), mode);
    setIsOpen(true);
    setQuery('');
  };

  return (
    <>
      {/* Floating Pill Search Bar Container */}
      <div className="fixed bottom-6 inset-x-0 z-40 flex flex-col items-center px-4 pointer-events-none">
        
        {/* Expanded Output Sheet (Rendered right above the pill) */}
        {isOpen && result && (
          <div className="pointer-events-auto w-full max-w-3xl mb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden animate-[slideUp_0.25s_ease-out] transition-colors">
            
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/70">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{result.mode === 'analytical' ? 'Suggested Analytical Investigation Plan' : 'Descriptive Data Synthesis'}</span>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onClearResult();
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 max-h-80 overflow-y-auto">
              {result.mode === 'analytical' ? (
                /* Analytical Plan with stylized timeline and pale blue tint */
                <div className="space-y-4">
                  {/* Disclaimer banner */}
                  <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span>This is a suggested analysis path generated from column metadata, not a definitive statistical conclusion.</span>
                  </div>

                  <div className="relative pl-6 space-y-4 border-l-2 border-blue-200 dark:border-blue-800">
                    {Array.isArray(result.plan) ? (
                      result.plan.map((step, idx) => (
                        <div key={idx} className="relative group">
                          {/* Timeline dot */}
                          <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-white dark:border-slate-900 shadow-sm" />
                          <div className="p-3 rounded-xl bg-blue-50/40 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-xs text-slate-800 dark:text-slate-200">
                            <span className="font-bold text-blue-900 dark:text-blue-300 mr-2">Step {idx + 1}:</span>
                            {typeof step === 'object' ? (step.step || step.description || JSON.stringify(step)) : step}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap">
                        {typeof result.plan === 'string' ? result.plan : JSON.stringify(result.plan, null, 2)}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Descriptive answer as clean text block */
                <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed font-sans">
                  {result.answer}
                </div>
              )}
            </div>

          </div>
        )}

        {/* The Pill Form */}
        <form 
          onSubmit={handleSubmit}
          className="pointer-events-auto w-full max-w-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-full p-2 pl-5 shadow-2xl border border-slate-300/80 dark:border-slate-700 flex items-center gap-3 transition-all hover:border-slate-400 dark:hover:border-slate-600 focus-within:ring-4 focus-within:ring-blue-500/15 focus-within:border-blue-500"
        >
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />

          <input
            type="text"
            placeholder={
              mode === 'descriptive' 
                ? 'Ask a descriptive question (e.g. "What is this dataset about?")...' 
                : 'Ask an analytical question (e.g. "Why did spend score drop?")...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
          />

          {/* Mode Switcher Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-full text-[11px] font-medium text-slate-600 dark:text-slate-400 flex-shrink-0">
            <button
              type="button"
              onClick={() => setMode('descriptive')}
              className={`px-2.5 py-1 rounded-full transition-all ${
                mode === 'descriptive' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm font-semibold' : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setMode('analytical')}
              className={`px-2.5 py-1 rounded-full transition-all ${
                mode === 'analytical' ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm font-semibold' : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Plan
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isAsking || !query.trim()}
            className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20 disabled:opacity-40 disabled:hover:bg-blue-600 transition-all cursor-pointer"
          >
            {isAsking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </form>

      </div>
    </>
  );
}
