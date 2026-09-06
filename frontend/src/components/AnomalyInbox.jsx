import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Wrench, 
  AlertTriangle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  Loader2,
  Info,
  ShieldCheck,
  ArrowRight,
  Zap
} from 'lucide-react';

// Typewriter text animation component
function TypewriterText({ text, speed = 12 }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let index = 0;
    const interval = setInterval(() => {
      index++;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayed}</span>;
}

export default function AnomalyInbox({ 
  anomalies = [], 
  selectedColumn, 
  onExplain, 
  onPreviewFix,
  loadingExplainId,
  loadingFixId,
  explanations = {}
}) {
  const [expandedCards, setExpandedCards] = useState({});
  const [customPrompts, setCustomPrompts] = useState({});

  const getQuickActions = (anomaly) => {
    switch (anomaly.issue) {
      case 'missing_values':
        return [
          { label: 'Fill with Median', prompt: 'Fill missing values with median' },
          { label: 'Fill with Mean', prompt: 'Fill missing values with mean' },
          { label: 'Drop Missing Rows', prompt: 'Drop rows with missing values' },
        ];
      case 'outliers':
        return [
          { label: 'Cap to IQR Bounds', prompt: 'Cap and clip outliers to IQR normal bounds' },
          { label: 'Drop Outlier Rows', prompt: 'Drop outlier rows' },
        ];
      case 'disguised_null':
        return [
          { label: `Replace '${anomaly.value}' with NaN`, prompt: `Replace disguised null marker '${anomaly.value}' with NaN` },
          { label: 'Impute with Median/Mode', prompt: `Replace disguised null marker '${anomaly.value}' with median or mode` },
        ];
      case 'mixed_numeric_column':
        return [
          { label: 'Extract Numbers & Cast', prompt: 'Strip non-numeric characters and cast column to float' },
          { label: 'Coerce Errors to NaN', prompt: 'Coerce non-numeric values to NaN' },
        ];
      case 'suggested_fuzzy_merges':
        return [
          { label: 'Standardize Categories', prompt: 'Standardize fuzzy string variants to dominant category' },
        ];
      default:
        return [
          { label: 'Auto Clean', prompt: `Clean anomaly ${anomaly.issue} in column ${anomaly.column}` },
        ];
    }
  };

  // Filter anomalies for the selected column or show all
  // Use exact equality for single-column anomalies, split-based for multi-column
  const displayedAnomalies = selectedColumn 
    ? anomalies.filter(a => {
        if (a.column === selectedColumn) return true;
        // Handle multi-column anomalies like "start_date / end_date"
        return a.column.split(' / ').map(s => s.trim()).includes(selectedColumn);
      })
    : anomalies;

  const toggleExpand = (anomalyKey) => {
    setExpandedCards(prev => ({
      ...prev,
      [anomalyKey]: !prev[anomalyKey]
    }));
  };

  const getIssueBadge = (issue) => {
    switch (issue) {
      case 'missing_values':
        return <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">Missing Values</span>;
      case 'outliers':
        return <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[11px] font-semibold">Statistical Outliers</span>;
      case 'disguised_null':
        return <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[11px] font-semibold">Disguised Null Marker</span>;
      case 'mixed_numeric_column':
        return <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[11px] font-semibold">Mixed Numeric / Stray Text</span>;
      case 'suggested_fuzzy_merges':
        return <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[11px] font-semibold">Fuzzy Category Typos</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">{issue.replace(/_/g, ' ')}</span>;
    }
  };

  // Section 8: Perfect File State
  if (anomalies.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <div className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xl shadow-emerald-500/10 mb-6">
          <ShieldCheck className="w-12 h-12" />
        </div>
        <h2 className="font-outfit font-extrabold text-3xl text-slate-900 dark:text-slate-100 tracking-tight">
          Dataset is 100% Clean!
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">
          Zero data health anomalies found. No disguised nulls, missing gaps, or malformed strings detected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-5xl transition-colors">
      
      {/* Canvas Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-outfit font-bold text-2xl text-slate-900 dark:text-slate-100">
            {selectedColumn ? `Column: ${selectedColumn}` : 'Detected Anomalies & Cleaning Center'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
            Showing {displayedAnomalies.length} anomaly card{displayedAnomalies.length === 1 ? '' : 's'}. Choose a quick fix, write custom instructions, or inspect side-by-side diffs.
          </p>
        </div>

        {selectedColumn && (
          <span className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
            Filtered View
          </span>
        )}
      </div>

      {/* Guide Banner for Making Changes */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/40 border border-blue-200/80 dark:border-blue-800 flex items-start gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0 mt-0.5">
          <Wrench className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <span className="font-bold text-slate-900 dark:text-slate-100">How to Make Changes to Your CSV: </span>
          <span>
            Every anomaly is actionable. Click any <strong>Quick Fix</strong> pill (e.g. <em>Fill with Median</em>) or enter your own custom instruction, then click <strong>Preview Fix</strong>. You will inspect the side-by-side cell diff before applying changes to the dataset.
          </span>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {displayedAnomalies.map((anomaly, idx) => {
          // Stable key: no idx — use column + issue only so explanations survive re-filter/re-sort
          const cardKey = `${anomaly.column}-${anomaly.issue}`;
          const isExplaining = loadingExplainId === cardKey;
          const isFixing = loadingFixId === cardKey;
          const explanation = explanations[cardKey];
          // isExpanded respects explicit toggle state; falls back to true only on first load
          const isExpanded = expandedCards[cardKey] !== undefined ? expandedCards[cardKey] : !!explanation;

          const quickActions = getQuickActions(anomaly);
          const currentPrompt = customPrompts[cardKey] || '';

          return (
            <div 
              key={`${anomaly.column}-${anomaly.issue}-${idx}`}
              className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
            >
              {/* Card Body */}
              <div className="p-5 flex flex-col gap-3.5">
                
                {/* Header Row: Column, Issue, Badge, and Diagnostic Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      {anomaly.column}
                    </span>
                    {getIssueBadge(anomaly.issue)}
                    {/* Only show "Fix Available" badge when a fix type actually applies */}
                    {['missing_values','outliers','mixed_numeric_column','disguised_null','inconsistent_categories','suggested_fuzzy_merges','date_format_issues'].includes(anomaly.issue) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Fix Available
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (!explanation) {
                        onExplain(anomaly, cardKey);
                      }
                      toggleExpand(cardKey);
                    }}
                    disabled={isExplaining}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all self-start sm:self-auto cursor-pointer"
                  >
                    {isExplaining ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                        <span>Diagnosing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>AI Diagnostic</span>
                        {explanation && (
                          isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5 text-slate-400" /> : <ChevronDown className="w-3 h-3 ml-0.5 text-slate-400" />
                        )}
                      </>
                    )}
                  </button>
                </div>

                {/* Context Metrics */}
                <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-4 flex-wrap">
                  {anomaly.frequency !== undefined && (
                    <span>
                      Affected: <strong className="text-slate-900 dark:text-slate-100 font-semibold">{anomaly.frequency}</strong> rows 
                      {anomaly.percent ? ` (${anomaly.percent}%)` : ''}
                    </span>
                  )}

                  {anomaly.value && (
                    <span>
                      Marker value: <code className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded font-mono text-[11px] font-semibold">{anomaly.value}</code>
                    </span>
                  )}

                  {anomaly.bounds && (
                    <span>
                      Normal range: [{anomaly.bounds[0]}, {anomaly.bounds[1]}]
                    </span>
                  )}
                </div>

                {/* Sample Values Preview */}
                {anomaly.sample_values && anomaly.sample_values.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Samples:</span>
                    {anomaly.sample_values.slice(0, 5).map((val, vIdx) => (
                      <span key={vIdx} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        {val === null ? 'null' : String(val)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Fuzzy Merges Preview */}
                {anomaly.suggested_merges && (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Suggestions: {anomaly.suggested_merges.map(m => m.join(' ➔ ')).join(', ')}
                  </div>
                )}

                {/* Action Row: Quick Fix Strategies & Custom Input */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5">
                  
                  {/* Quick Fix Strategy Pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>Quick fixes:</span>
                    </span>
                    {quickActions.map((act, aIdx) => (
                      <button
                        key={aIdx}
                        onClick={() => onPreviewFix(anomaly, cardKey, act.prompt)}
                        disabled={isFixing}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:bg-blue-200 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200/80 dark:border-blue-800 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title={`Apply strategy: ${act.prompt}`}
                      >
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Prompt Instruction & Preview Fix Button */}
                  <div className="flex items-center gap-2 flex-col sm:flex-row pt-1">
                    <div className="relative flex-1 w-full">
                      <input
                        type="text"
                        placeholder="Or custom instruction (e.g. 'fill with 0', 'cap at 1000', 'drop if empty')..."
                        value={currentPrompt}
                        onChange={(e) => setCustomPrompts(prev => ({ ...prev, [cardKey]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onPreviewFix(anomaly, cardKey, currentPrompt || null);
                          }
                        }}
                        className="w-full pl-3.5 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-750 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 transition-all"
                      />
                      {currentPrompt && (
                        <button
                          onClick={() => setCustomPrompts(prev => ({ ...prev, [cardKey]: '' }))}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                          title="Clear"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => onPreviewFix(anomaly, cardKey, currentPrompt || null)}
                      disabled={isFixing}
                      className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                        isFixing
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 animate-pulse cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                      }`}
                    >
                      {isFixing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sandboxing fix...</span>
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Preview Fix</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

              </div>

              {/* Accordion Downward Expansion (AI Explanation with Typewriter) */}
              {isExpanded && explanation && (
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/20 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20 text-slate-800 dark:text-slate-200 text-xs leading-relaxed animate-[fadeIn_0.3s_ease]">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                        <span>AI Diagnostic Explanation</span>
                        <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">Grounded via statistical metadata</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 font-sans">
                        <TypewriterText text={explanation} speed={10} />
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })}

        {displayedAnomalies.length === 0 && (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm">
            No anomalies found for this column! All checks passed.
          </div>
        )}
      </div>

    </div>
  );
}
