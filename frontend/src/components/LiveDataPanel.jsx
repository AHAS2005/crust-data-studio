import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Sparkles, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Filter, 
  CheckCircle2, 
  Maximize2, 
  Minimize2, 
  X,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../api';

export default function LiveDataPanel({ 
  isOpen, 
  onClose, 
  stepCount,
  datasetName 
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [isExpanded, setIsExpanded] = useState(false); // Split screen vs full width

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDataPreview(page, pageSize, modifiedOnly, search);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load live data');
    } finally {
      setLoading(false);
    }
  };

  // Refetch when page, pageSize, modifiedOnly, or stepCount changes
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, page, pageSize, modifiedOnly, stepCount]);

  // Debounce search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  if (!isOpen) return null;

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const modifiedColsSet = new Set(data?.modified_columns || []);
  const modifiedRowsCount = data?.modified_row_count || 0;
  const totalRows = data?.total_rows || 0;

  return (
    <div 
      className={`border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[calc(100vh-4rem)] transition-all duration-300 shadow-xl z-20 ${
        isExpanded ? 'w-full md:w-[850px] lg:w-[1000px]' : 'w-full md:w-[540px] lg:w-[680px]'
      }`}
    >
      {/* Panel Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-outfit font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                Updated CSV Live Sheet
              </h3>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Replay
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
              {modifiedRowsCount} row{modifiedRowsCount === 1 ? '' : 's'} modified across {modifiedColsSet.size} column{modifiedColsSet.size === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Refresh button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title="Refresh Table"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Expand width button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title={isExpanded ? "Collapse width" : "Expand width"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title="Close Sheet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toolbar: Filters, Search, Pagination */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        
        {/* Left: Row filter tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => { setModifiedOnly(false); setPage(1); }}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              !modifiedOnly 
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-semibold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            All Rows ({totalRows})
          </button>

          <button
            onClick={() => { setModifiedOnly(true); setPage(1); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              modifiedOnly 
                ? 'bg-emerald-600 text-white shadow-sm font-semibold' 
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Modified Only ({modifiedRowsCount})</span>
          </button>
        </div>

        {/* Right: Search & Page Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search in sheet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-750 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1">
              {data?.current_page || 1}/{data?.total_pages || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data?.total_pages || 1, p + 1))}
              disabled={page >= (data?.total_pages || 1) || loading}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        {loading && !data ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading live data sheet...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs">
            {modifiedOnly ? "No rows have been modified yet." : "No rows match your search."}
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 shadow-sm">
              <tr>
                {/* Row Number Column */}
                <th className="p-2.5 font-bold border-r border-slate-200 dark:border-slate-700 w-16 text-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800">
                  #
                </th>

                {/* Column Headers */}
                {columns.map(col => {
                  const isModifiedCol = modifiedColsSet.has(col);

                  return (
                    <th 
                      key={col} 
                      className={`p-2.5 font-semibold border-r border-slate-200 dark:border-slate-700 whitespace-nowrap min-w-[130px] ${
                        isModifiedCol ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isModifiedCol && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="This column has approved fixes" />
                        )}
                        <span>{col}</span>
                        {isModifiedCol && (
                          <span className="text-[9px] font-sans uppercase font-bold px-1 rounded bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                            Edited
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {rows.map((rowItem) => {
                const isModRow = rowItem._is_modified;
                const modColsSet = new Set(rowItem._modified_cols || []);

                return (
                  <tr 
                    key={rowItem._index}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                      isModRow ? 'bg-emerald-50/20 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    {/* Row Index with green border indicator if modified */}
                    <td 
                      className={`p-2.5 text-center font-bold border-r border-slate-200 dark:border-slate-800 select-none ${
                        isModRow 
                          ? 'border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300' 
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      #{rowItem._index}
                    </td>

                    {/* Cells */}
                    {columns.map(col => {
                      const isModCell = modColsSet.has(col);
                      const currentVal = rowItem.values[col];
                      const rawVal = rowItem._raw_vals?.[col];

                      return (
                        <td
                          key={col}
                          className={`p-2.5 border-r border-slate-200 dark:border-slate-800 truncate max-w-[200px] transition-colors relative group ${
                            isModCell 
                              ? 'bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 font-bold ring-1 ring-inset ring-emerald-300 dark:ring-emerald-700' 
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                          title={isModCell ? `Original raw value: '${rawVal}' ➔ Cleaned: '${currentVal}'` : undefined}
                        >
                          {currentVal === null ? (
                            <em className="text-slate-400 dark:text-slate-500 font-sans font-normal text-[11px]">null</em>
                          ) : (
                            String(currentVal)
                          )}

                          {/* Subtle sparkle tag for modified cells */}
                          {isModCell && (
                            <span className="ml-1 text-[9px] font-sans px-1 py-0.2 rounded bg-emerald-200/80 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 uppercase tracking-tighter">
                              Cleaned
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-sans">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 inline-block" />
          <span>Green highlight = Modified cells/rows</span>
        </div>
        <div>
          Showing {rows.length} of {data?.total_matched || 0} rows
        </div>
      </div>

    </div>
  );
}
