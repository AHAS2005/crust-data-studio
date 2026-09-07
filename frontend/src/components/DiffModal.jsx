import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  AlertTriangle, 
  ShieldAlert, 
  Code2, 
  ChevronDown, 
  ChevronRight, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function DiffModal({ 
  fixData, 
  anomaly, 
  onClose, 
  onApprove, 
  isApproving 
}) {
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!fixData) return null;

  const { code, diff, cell_diff, is_safe, rejection_reason, warning } = fixData;
  const columns = cell_diff?.columns || [];
  const changedRows = cell_diff?.changed_rows || [];
  const sampleRows = changedRows.length > 0 ? changedRows : (cell_diff?.sample_preview || []);

  const modifiedCellsCount = diff?.modified_cell_count ?? changedRows.length;
  const rowsDropped = diff?.rows_dropped ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
      
      <div className="w-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-outfit font-bold text-lg text-slate-900 dark:text-slate-100">
                Safe Execution Preview
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                Sandboxed Subprocess
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review side-by-side cell transformations before committing to the audit ledger.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* GUARDRAIL SAFETY CHECK REJECTION CARD */}
          {!is_safe ? (
            <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-3">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                <h3 className="font-outfit font-bold text-lg text-rose-900 dark:text-rose-200">
                  Fix Rejected by Safety Guardrails
                </h3>
              </div>
              <p className="text-sm text-rose-800 dark:text-rose-300 font-sans">
                {rejection_reason || "This operation violates data safety thresholds (e.g. dropping excessive rows or rewriting the whole table)."}
              </p>
              <div className="text-xs text-rose-700 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-900/60 p-3 rounded-xl">
                This fix cannot be added to the ledger to protect your dataset integrity.
              </div>
            </div>
          ) : (
            <>
              {/* IMPACT SUMMARY BANNER */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50/60 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-outfit font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100">
                      This action will modify {String(modifiedCellsCount)} cell{modifiedCellsCount === 1 ? '' : 's'} and drop {rowsDropped} row{rowsDropped === 1 ? '' : 's'}.
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      AST validation passed • Execution completed inside safe subprocess sandbox
                    </p>
                  </div>
                </div>

                {warning && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate max-w-xs">{warning}</span>
                  </div>
                )}
              </div>

              {/* SPLIT-PANE SIDE-BY-SIDE DATA TABLES */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
                  <span>Side-by-Side Cell Diff Preview (Showing sample of affected rows)</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700" />
                      <span>Original</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700" />
                      <span>Proposed</span>
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                  <div className="overflow-x-auto max-h-[42vh]">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead className="bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-3 font-semibold border-r border-slate-200 dark:border-slate-700 w-16">Row</th>
                          <th className="p-3 font-semibold border-r border-slate-200 dark:border-slate-700 w-24">State</th>
                          {columns.map(col => (
                            <th key={col} className="p-3 font-semibold border-r border-slate-200 dark:border-slate-700 min-w-[130px]">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                        {sampleRows.map((rowItem, rIdx) => {
                          const isModified = rowItem.status === 'modified';
                          const isDropped = rowItem.status === 'dropped';
                          const modCols = new Set(rowItem.modified_columns || []);

                          return (
                            <React.Fragment key={rIdx}>
                              {/* Row 1: BEFORE / CURRENT */}
                              <tr className={`hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors ${isDropped ? 'bg-rose-50/70 dark:bg-rose-950/40' : 'bg-slate-50/50 dark:bg-slate-850/50'}`}>
                                <td rowSpan={isModified ? 2 : 1} className="p-3 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 align-top">
                                  #{rowItem.row_index}
                                </td>
                                <td className="p-3 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                  {isDropped ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 font-bold">🗑 DELETED</span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">Before</span>
                                  )}
                                </td>
                                {columns.map(col => {
                                  const cellChanged = modCols.has(col);
                                  const val = rowItem.before ? rowItem.before[col] : undefined;
                                  return (
                                    <td 
                                      key={col} 
                                      className={`p-3 border-r border-slate-200 dark:border-slate-700 transition-colors truncate max-w-[180px] ${
                                        isDropped
                                          ? 'line-through text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50'
                                          : cellChanged 
                                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-semibold ring-1 ring-inset ring-rose-200 dark:ring-rose-800' 
                                            : 'text-slate-600 dark:text-slate-400'
                                      }`}
                                    >
                                      {val === null || val === undefined ? <em className="text-slate-400">null</em> : String(val)}
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* Row 2: AFTER / PROPOSED (If modified) */}
                              {isModified && (
                                <tr className="bg-emerald-50/30 dark:bg-emerald-950/30 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/50 transition-colors">
                                  <td className="p-3 font-semibold text-emerald-700 dark:text-emerald-400 border-r border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold">After</span>
                                  </td>
                                  {columns.map(col => {
                                    const cellChanged = modCols.has(col);
                                    const val = rowItem.after ? rowItem.after[col] : undefined;
                                    return (
                                      <td 
                                        key={col} 
                                        className={`p-3 border-r border-slate-200 dark:border-slate-700 transition-colors truncate max-w-[180px] ${
                                          cellChanged 
                                            ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold ring-1 ring-inset ring-emerald-300 dark:ring-emerald-700' 
                                            : 'text-slate-600 dark:text-slate-400'
                                        }`}
                                      >
                                        {val === null || val === undefined ? <em className="text-slate-400">null</em> : String(val)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* CODE TOGGLE (TECHNICAL AUDIT) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-900 text-slate-100">
            <button
              onClick={() => setShowCode(!showCode)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono font-medium hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-blue-400" />
                <span>View underlying generated Python code (Audit)</span>
              </div>
              {showCode ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {showCode && (
              <div className="p-4 border-t border-slate-800 bg-slate-950 font-mono text-xs overflow-x-auto">
                <pre className="text-emerald-400 leading-relaxed whitespace-pre-wrap">{code}</pre>
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium transition-all cursor-pointer"
          >
            Discard
          </button>

          {is_safe && (
            <button
              onClick={() => onApprove(fixData)}
              disabled={isApproving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isApproving ? 'Applying to Ledger...' : 'Approve & Apply to Ledger'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
