import React from 'react';
import { 
  Sparkles, 
  Download, 
  History, 
  Key, 
  CheckCircle2, 
  FileSpreadsheet, 
  Layers,
  RotateCcw,
  Sun,
  Moon
} from 'lucide-react';
import logoDark from '../assets/logo_transparent_dark.png';
import logoLight from '../assets/logo_transparent_light.png';

export default function Navbar({ 
  datasetName, 
  healthScore, 
  stepCount, 
  onOpenHistory, 
  onOpenApiKeyModal, 
  onExportCsv, 
  onExportLedger,
  onResetWorkspace,
  provider,
  hasDataset,
  isLiveSheetOpen,
  onToggleLiveSheet,
  darkMode,
  onToggleDarkMode
}) {
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
    return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
  };

  const getProviderLabel = () => {
    if (provider === 'custom') {
      const model = localStorage.getItem('cs_custom_model') || 'Custom LLM';
      return model.length > 18 ? model.slice(0, 16) + '...' : model;
    }
    if (provider === 'nemotron') return 'NVIDIA Nemotron';
    if (provider === 'groq') return 'Groq LLM';
    return 'Demo Mock Mode';
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md transition-colors">
      <div className="w-full px-3 sm:px-4 md:px-6 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Name (Left-aligned) */}
        <div className="flex items-center gap-3">
          <img 
            src={darkMode ? logoLight : logoDark} 
            alt="CRUST Data Studio" 
            className="h-8 sm:h-9 w-auto max-w-[150px] sm:max-w-[190px] object-contain select-none transition-all duration-150"
          />
          <div className="hidden xl:block border-l border-slate-200 dark:border-slate-800 pl-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans leading-tight">
              Intelligent Profiling & Cleaning Studio
            </p>
          </div>
        </div>

        {/* Center / Health Score & Dataset Info */}
        {hasDataset && (
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium max-w-[140px] truncate">{datasetName}</span>
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${getScoreColor(healthScore)}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Health Score: {healthScore}% Clean</span>
            </div>
          </div>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Intelligence Engine Settings */}
          <button
            onClick={onOpenApiKeyModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm cursor-pointer"
            title="Configure Personal API Keys"
          >
            <Key className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden lg:inline">{getProviderLabel()}</span>
            <span className={`w-2 h-2 rounded-full ${provider === 'mock' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
          </button>

          {/* New / Reset CSV Button */}
          {hasDataset && (
            <button
              onClick={onResetWorkspace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm cursor-pointer"
              title="Upload another CSV / Reset workspace"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">New CSV</span>
            </button>
          )}

          {/* Export Actions (when dataset is loaded) */}
          {hasDataset && (
            <>
              <button
                onClick={onExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
                title="Download Cleaned CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>

              <button
                onClick={onExportLedger}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all cursor-pointer"
                title="Export Reversible Audit Ledger JSON"
              >
                <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Export Ledger</span>
              </button>
            </>
          )}

          {/* Live Data Sheet Window Toggle */}
          {hasDataset && (
            <button
              onClick={onToggleLiveSheet}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm cursor-pointer ${
                isLiveSheetOpen 
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20 font-semibold' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200'
              }`}
              title="Toggle Live Updated CSV Window on the Right"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Live CSV</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isLiveSheetOpen ? 'bg-emerald-600 dark:bg-emerald-400 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
            </button>
          )}

          {/* History Drawer Toggle */}
          {hasDataset && (
            <button
              onClick={onOpenHistory}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm cursor-pointer"
              title="View Approved Cleaning History"
            >
              <History className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span className="hidden sm:inline">History</span>
              {stepCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                  {stepCount}
                </span>
              )}
            </button>
          )}

          {/* Dark Mode Toggle Button */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm cursor-pointer"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle Dark Mode"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
