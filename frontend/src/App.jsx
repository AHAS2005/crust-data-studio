import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import FileDropzone from './components/FileDropzone';
import Sidebar from './components/Sidebar';
import AnomalyInbox from './components/AnomalyInbox';
import DiffModal from './components/DiffModal';
import HistoryDrawer from './components/HistoryDrawer';
import SpotlightBar from './components/SpotlightBar';
import ApiKeyModal from './components/ApiKeyModal';
import LiveDataPanel from './components/LiveDataPanel';
import { api } from './api';
import { AlertCircle, X } from 'lucide-react';

export default function App() {
  // Application State
  const [hasDataset, setHasDataset] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [report, setReport] = useState(null);
  const [healthScore, setHealthScore] = useState(100);
  const [steps, setSteps] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState(null);

  // Modals and Drawers
  const [historyOpen, setHistoryOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [isLiveSheetOpen, setIsLiveSheetOpen] = useState(true);
  const [activeFixData, setActiveFixData] = useState(null);
  const [activeFixAnomaly, setActiveFixAnomaly] = useState(null);

  // Loading States
  const [isProfiling, setIsProfiling] = useState(false);
  const [loadingExplainId, setLoadingExplainId] = useState(null);
  const [loadingFixId, setLoadingFixId] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  // Content Stores
  const [explanations, setExplanations] = useState({});
  const [askResult, setAskResult] = useState(null);
  const [provider, setProvider] = useState('mock');
  const [apiErrorBanner, setApiErrorBanner] = useState(null);

  // Dark Mode Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('cs_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('cs_dark_mode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load initial status on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem('cs_provider') || 'mock';
    setProvider(savedProvider);

    api.getStatus()
      .then(data => {
        if (data.loaded) {
          setHasDataset(true);
          setDatasetName(data.filename);
          setReport(data.report);
          setHealthScore(data.health_score);
          setSteps(data.steps || []);
        }
      })
      .catch(() => {});
  }, []);

  // Upload handler
  const handleFileSelected = async (file) => {
    setIsProfiling(true);
    setApiErrorBanner(null);
    try {
      const data = await api.uploadFile(file);
      setHasDataset(true);
      setDatasetName(data.filename);
      setReport(data.report);
      setHealthScore(data.health_score);
      setSteps(data.steps || []);
      setSelectedColumn(null);
      setExplanations({});
    } catch (err) {
      setApiErrorBanner(`Upload failed: ${err.message}`);
    } finally {
      setIsProfiling(false);
    }
  };

  // Sample data loader
  const handleLoadSample = async () => {
    setIsProfiling(true);
    setApiErrorBanner(null);
    try {
      const data = await api.loadSample();
      setHasDataset(true);
      setDatasetName(data.filename);
      setReport(data.report);
      setHealthScore(data.health_score);
      setSteps(data.steps || []);
      setSelectedColumn(null);
      setExplanations({});
    } catch (err) {
      setApiErrorBanner(`Failed to load sample: ${err.message}`);
    } finally {
      setIsProfiling(false);
    }
  };

  // Explain Anomaly
  const handleExplain = async (anomaly, cardKey) => {
    setLoadingExplainId(cardKey);
    setApiErrorBanner(null);
    try {
      const data = await api.explainAnomaly(anomaly);
      setExplanations(prev => ({
        ...prev,
        [cardKey]: data.explanation
      }));
    } catch (err) {
      setApiErrorBanner(`AI service notice: ${err.message}. Explanations paused.`);
    } finally {
      setLoadingExplainId(null);
    }
  };

  // Preview Fix
  const handlePreviewFix = async (anomaly, cardKey, customInstruction = null) => {
    setLoadingFixId(cardKey);
    setApiErrorBanner(null);
    try {
      const data = await api.previewFix(anomaly, customInstruction);
      setActiveFixData(data);
      setActiveFixAnomaly(anomaly);
    } catch (err) {
      setApiErrorBanner(`Fix preview failed: ${err.message}`);
    } finally {
      setLoadingFixId(null);
    }
  };

  // Reset Workspace & Clear Dataset
  const handleResetWorkspace = async () => {
    try {
      await api.resetWorkspace();
    } catch (err) {
      console.warn('Reset error:', err);
    }
    setHasDataset(false);
    setDatasetName('');
    setReport(null);
    setHealthScore(100);
    setSteps([]);
    setSelectedColumn(null);
    setExplanations({});
    setActiveFixData(null);
    setActiveFixAnomaly(null);
    setAskResult(null);
    setApiErrorBanner(null);
  };

  // Approve Fix to Ledger
  const handleApproveFix = async (fixData) => {
    if (!activeFixAnomaly) return;
    setIsApproving(true);
    try {
      const data = await api.approveFix({
        anomalyTarget: activeFixAnomaly.column,
        description: `Auto-generated fix for ${activeFixAnomaly.issue} in ${activeFixAnomaly.column}`,
        codeString: fixData.code,
      });
      setSteps(data.steps);
      setReport(data.report);
      setHealthScore(data.health_score);
      setActiveFixData(null);
      setActiveFixAnomaly(null);
    } catch (err) {
      setApiErrorBanner(`Failed to approve fix: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  // Rollback
  const handleRollback = async (stepId, mode) => {
    setIsRollingBack(true);
    try {
      const data = await api.rollbackStep(stepId, mode);
      setSteps(data.steps);
      setReport(data.report);
      setHealthScore(data.health_score);
    } catch (err) {
      setApiErrorBanner(`Rollback failed: ${err.message}`);
    } finally {
      setIsRollingBack(false);
    }
  };

  // Natural language query
  const handleAskQuestion = async (query, mode) => {
    setIsAsking(true);
    setApiErrorBanner(null);
    try {
      const data = await api.askQuestion(query, mode);
      setAskResult(data);
    } catch (err) {
      setApiErrorBanner(`Question query failed: ${err.message}`);
    } finally {
      setIsAsking(false);
    }
  };

  // Exports
  const handleExportCsv = () => {
    window.open(api.exportCsvUrl, '_blank');
  };

  const handleExportLedger = () => {
    window.open(api.exportLedgerUrl, '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      
      {/* Top Navbar */}
      <Navbar
        datasetName={datasetName}
        healthScore={healthScore}
        stepCount={steps.length}
        hasDataset={hasDataset}
        provider={provider}
        isLiveSheetOpen={isLiveSheetOpen}
        onToggleLiveSheet={() => setIsLiveSheetOpen(v => !v)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
        onExportCsv={handleExportCsv}
        onExportLedger={handleExportLedger}
        onResetWorkspace={handleResetWorkspace}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(prev => !prev)}
      />

      {/* Section 8: Total API Failure / Warning Banner */}
      {apiErrorBanner && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 animate-[fadeIn_0.2s_ease]">
          <div className="flex items-center gap-2 max-w-4xl">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{apiErrorBanner}</span>
          </div>
          <button
            onClick={() => setApiErrorBanner(null)}
            className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main App Workspace */}
      <main className="flex-1 flex flex-col">
        {!hasDataset ? (
          /* File Upload Experience (Section 1) */
          <FileDropzone
            onFileSelected={handleFileSelected}
            onLoadSample={handleLoadSample}
            isProfiling={isProfiling}
          />
        ) : (
          /* Main Analysis & Cleaning Studio Layout (Section 2, 3 & Live Sheet) */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Sidebar (Column Navigator) */}
            <Sidebar
              columnTypes={report?.column_types || {}}
              anomalies={report?.anomalies || []}
              selectedColumn={selectedColumn}
              onSelectColumn={setSelectedColumn}
              healthScore={healthScore}
              totalRows={report?.summary?.total_rows || 0}
              onResetWorkspace={handleResetWorkspace}
            />

            {/* Center Canvas (Anomaly Inbox) */}
            <AnomalyInbox
              anomalies={report?.anomalies || []}
              selectedColumn={selectedColumn}
              onExplain={handleExplain}
              onPreviewFix={handlePreviewFix}
              loadingExplainId={loadingExplainId}
              loadingFixId={loadingFixId}
              explanations={explanations}
            />

            {/* Right Window: Live Updated CSV Data Sheet */}
            <LiveDataPanel
              isOpen={isLiveSheetOpen}
              onClose={() => setIsLiveSheetOpen(false)}
              stepCount={steps.length}
              datasetName={datasetName}
            />
          </div>
        )}
      </main>

      {/* Section 6: Floating Pill Search Bar for Natural Language Questions */}
      {hasDataset && (
        <SpotlightBar
          onAskQuestion={handleAskQuestion}
          isAsking={isAsking}
          result={askResult}
          onClearResult={() => setAskResult(null)}
        />
      )}

      {/* Section 4: Split-Pane Side-by-Side Diff Modal */}
      {activeFixData && (
        <DiffModal
          fixData={activeFixData}
          anomaly={activeFixAnomaly}
          onClose={() => {
            setActiveFixData(null);
            setActiveFixAnomaly(null);
          }}
          onApprove={handleApproveFix}
          isApproving={isApproving}
        />
      )}

      {/* Section 5: Reversible Audit Ledger Drawer */}
      <HistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        steps={steps}
        onRollback={handleRollback}
        isRollingBack={isRollingBack}
      />

      {/* Section 7: Bring-Your-Own-Key Setup Modal */}
      <ApiKeyModal
        isOpen={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onProviderSaved={(newProvider) => setProvider(newProvider)}
      />

    </div>
  );
}
