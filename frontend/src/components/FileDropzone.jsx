import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

export default function FileDropzone({ onFileSelected, onLoadSample, isProfiling }) {
  const [isDragging, setIsDragging] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const fileInputRef = useRef(null);

  const triggerWiggle = (message) => {
    setToastMessage(message);
    setWiggle(true);
    setTimeout(() => setWiggle(false), 600);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const validateAndProcessFile = (file) => {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      triggerWiggle('Please upload a CSV file. Excel files need to be converted first.');
      return;
    }

    if (!fileName.endsWith('.csv')) {
      triggerWiggle('Unsupported file format. Please drop a valid .csv file.');
      return;
    }

    onFileSelected(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 py-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium shadow-lg animate-bounce">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Glassmorphism Dropzone Card */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full max-w-2xl rounded-3xl p-8 sm:p-12 transition-all duration-300 text-center glassmorphism dark:glassmorphism-dark shadow-2xl shadow-blue-500/5 ${
          isDragging 
            ? 'border-2 border-blue-500 ring-8 ring-blue-500/10 scale-[1.02] bg-white/90 dark:bg-slate-900/90' 
            : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/80 dark:bg-slate-900/80'
        } ${wiggle ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              validateAndProcessFile(e.target.files[0]);
            }
          }}
        />

        {isProfiling ? (
          /* Sleek Indeterminate Handoff Progress State */
          <div className="py-8 space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 animate-pulse shadow-md">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-outfit font-bold text-2xl text-slate-800 dark:text-slate-100">
                Profiling data footprint...
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-sans max-w-sm mx-auto">
                Running deterministic statistical checks, identifying disguised nulls, outliers, and type schemas without calling the LLM.
              </p>
            </div>
            <div className="w-full max-w-md mx-auto h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 w-2/5 rounded-full animate-[indeterminate_1.4s_infinite_linear]" />
            </div>
          </div>
        ) : (
          /* Default Upload State */
          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner cursor-pointer hover:scale-105 transition-transform"
            >
              <UploadCloud className="w-10 h-10" />
            </div>

            <div>
              <h2 className="font-outfit font-bold text-3xl text-slate-900 dark:text-slate-100 tracking-tight">
                Drop your CSV dataset here
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-sans max-w-md mx-auto">
                Drag and drop your file to immediately analyze data health, detect anomalies, and generate sandboxed Python cleaning fixes.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                Browse CSV File
              </button>

              <button
                onClick={onLoadSample}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium text-sm transition-all shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Load Messy Sample Data</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              CSV files supported • Multi-encoding resilient • Secure in-memory session processing
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
