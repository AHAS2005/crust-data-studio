import React, { useState, useEffect } from 'react';
import { 
  X, 
  History, 
  Undo2, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  ArrowDown, 
  ShieldAlert,
  Loader2
} from 'lucide-react';

export default function HistoryDrawer({ 
  isOpen, 
  onClose, 
  steps = [], 
  onRollback, 
  isRollingBack 
}) {
  const [rollbackModalStep, setRollbackModalStep] = useState(null);
  const [rollingBackStepId, setRollingBackStepId] = useState(null);

  useEffect(() => {
    if (!isRollingBack) {
      setRollingBackStepId(null);
    }
  }, [isRollingBack]);

  if (!isOpen) return null;

  const handleInitiateRollback = (step) => {
    setRollingBackStepId(step.step_id);
    // If it's the very last step, cascade or single are equivalent
    const isLastStep = step.step_id === steps[steps.length - 1]?.step_id;
    if (isLastStep) {
      onRollback(step.step_id, 'cascade');
    } else {
      // Step has subsequent dependent steps
      setRollbackModalStep(step);
    }
  };

  const confirmRollback = (mode) => {
    if (rollbackModalStep) {
      setRollingBackStepId(rollbackModalStep.step_id);
      onRollback(rollbackModalStep.step_id, mode);
      setRollbackModalStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-[slideLeft_0.25s_ease-out] transition-colors">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850/60">
            <div className="flex items-center gap-2.5">
              <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h3 className="font-outfit font-bold text-lg text-slate-900 dark:text-slate-100">
                  Cleaning Audit Ledger
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                  {steps.length} approved transformation{steps.length === 1 ? '' : 's'} recorded
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {steps.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-3">
                <Layers className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-sm">No approved cleaning steps yet.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                  Preview any anomaly fix from the main canvas and approve it to see it recorded sequentially here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Replay Sequence (Raw ➔ Cleaned)
                </div>

                {steps.map((step, idx) => {
                  const subsequentCount = steps.length - (idx + 1);

                  return (
                    <div 
                      key={step.step_id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all space-y-2 relative group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-mono font-bold text-xs flex items-center justify-center">
                            {step.step_id}
                          </span>
                          <span className="font-mono font-semibold text-xs text-slate-800 dark:text-slate-200">
                            [{step.anomaly_target}]
                          </span>
                        </div>

                        {/* Undo Action Button */}
                        <button
                          onClick={() => handleInitiateRollback(step)}
                          disabled={isRollingBack}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 text-slate-500 dark:text-slate-400 text-xs font-medium transition-all cursor-pointer disabled:opacity-60"
                          title="Undo this step"
                        >
                          {isRollingBack && rollingBackStepId === step.step_id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600 dark:text-rose-400" />
                              <span className="text-rose-600 dark:text-rose-400">Reverting...</span>
                            </>
                          ) : (
                            <>
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Undo</span>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                        {step.description}
                      </p>

                      {subsequentCount > 0 && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 pt-1">
                          <ArrowDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                          <span>{subsequentCount} step{subsequentCount === 1 ? '' : 's'} depend on this sequence</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drawer Footer info */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>Ledger persists raw data hash and guarantees reproducible replay.</span>
          </div>

        </div>
      </div>

      {/* SEQUENTIAL ROLLBACK WARNING MODAL */}
      {rollbackModalStep && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-outfit font-bold text-lg text-slate-900 dark:text-slate-100">
                  Sequential Rollback Warning
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Undoing Step {rollbackModalStep.step_id} with subsequent steps
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Cleaning steps replay sequentially against the raw data. Later steps may depend on data transformations performed by Step {rollbackModalStep.step_id}.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => confirmRollback('cascade')}
                className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-rose-500/80 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-200 text-xs font-semibold transition-all text-left cursor-pointer"
              >
                <div>
                  <div className="font-bold">Revert Step {rollbackModalStep.step_id} & All Subsequent Steps</div>
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 font-normal">Safest option to prevent broken replay dependencies.</div>
                </div>
                <Undo2 className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 ml-2" />
              </button>

              <button
                onClick={() => confirmRollback('single')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all text-left cursor-pointer"
              >
                <div>
                  <div className="font-bold">Remove Only Step {rollbackModalStep.step_id}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">Re-run remaining steps against raw data.</div>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRollbackModalStep(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
