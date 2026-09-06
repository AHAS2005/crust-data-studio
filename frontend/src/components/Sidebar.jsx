import React, { useState, useMemo } from 'react';
import { Search, ShieldAlert, CheckCircle2, AlertTriangle, Filter, Layers, RotateCcw } from 'lucide-react';

export default function Sidebar({ 
  columnTypes = {}, 
  anomalies = [], 
  selectedColumn, 
  onSelectColumn, 
  healthScore = 100,
  totalRows = 0,
  onResetWorkspace
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'issues', 'clean'

  // Calculate anomaly counts and status per column
  const columnStatus = useMemo(() => {
    const statusMap = {};
    const columns = Object.keys(columnTypes);

    columns.forEach(col => {
      statusMap[col] = {
        name: col,
        type: columnTypes[col] || 'unknown',
        anomalies: [],
        severity: 'green' // 'red', 'yellow', 'green'
      };
    });

    anomalies.forEach(anomaly => {
      const col = anomaly.column;
      // Direct match: this anomaly belongs to a known single column
      if (statusMap[col]) {
        statusMap[col].anomalies.push(anomaly);
      } else {
        // Multi-column anomaly (e.g. "start_date / end_date") — check if any known
        // column name appears in the anomaly's column string (split by " / ")
        const anomalyCols = col.split(' / ').map(s => s.trim());
        columns.forEach(c => {
          if (anomalyCols.includes(c)) {
            statusMap[c].anomalies.push(anomaly);
          }
        });
      }
    });

    columns.forEach(col => {
      const entry = statusMap[col];
      const issueCount = entry.anomalies.length;
      const hasCritical = entry.anomalies.some(a => 
        (a.issue === 'missing_values' && a.percent > 20) || 
        a.issue === 'mixed_numeric_column' ||  // correct backend type (was 'invalid_mixed_types')
        a.issue === 'invalid_mixed_types'       // keep for backward compatibility
      );

      if (hasCritical) {
        entry.severity = 'red';
      } else if (issueCount > 0) {
        entry.severity = 'yellow';
      } else {
        entry.severity = 'green';
      }
    });

    return statusMap;
  }, [columnTypes, anomalies]);

  const filteredColumns = useMemo(() => {
    return Object.values(columnStatus).filter(col => {
      const matchesSearch = col.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterMode === 'issues') return col.severity !== 'green';
      if (filterMode === 'clean') return col.severity === 'green';
      return true;
    });
  }, [columnStatus, searchQuery, filterMode]);

  const totalIssuesCount = anomalies.length;

  return (
    <aside className="w-full md:w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[calc(100vh-4rem)] flex-shrink-0 transition-colors">
      
      {/* Top Global Health Card */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Dataset Health
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
            {totalRows.toLocaleString()} rows
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-sm">
          <div>
            <div className="font-outfit font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight">
              {healthScore}%
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {healthScore >= 80 ? 'Good condition' : healthScore >= 60 ? 'Needs attention' : 'Significant messiness'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{totalIssuesCount} Issues</span>
          </div>
        </div>
      </div>

      {/* Column Search & Filter Chips */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Filter columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-750 focus:bg-white dark:focus:bg-slate-750 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              filterMode === 'all' 
                ? 'bg-slate-900 dark:bg-blue-600 text-white' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All ({Object.keys(columnTypes).length})
          </button>
          <button
            onClick={() => setFilterMode('issues')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              filterMode === 'issues' 
                ? 'bg-amber-500 text-white' 
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            }`}
          >
            Issues
          </button>
          <button
            onClick={() => setFilterMode('clean')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              filterMode === 'clean' 
                ? 'bg-emerald-600 text-white' 
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            Clean
          </button>
        </div>
      </div>

      {/* Column List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Special button: View All Column Anomalies */}
        <button
          onClick={() => onSelectColumn(null)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-all ${
            selectedColumn === null 
              ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 font-semibold shadow-sm' 
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>All Anomalies Inbox</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
            {totalIssuesCount}
          </span>
        </button>

        <div className="pt-2 pb-1 px-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Columns ({filteredColumns.length})
        </div>

        {filteredColumns.map((col) => {
          const isSelected = selectedColumn === col.name;
          const dotColor = 
            col.severity === 'red' 
              ? 'bg-rose-500 shadow-rose-500/50 shadow-sm' 
              : col.severity === 'yellow' 
              ? 'bg-amber-500 shadow-amber-500/50 shadow-sm' 
              : 'bg-emerald-500';

          return (
            <button
              key={col.name}
              onClick={() => onSelectColumn(col.name)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-all group ${
                isSelected 
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold border border-slate-200 dark:border-slate-700' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                {/* Indicator Dot */}
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                <span className="truncate">{col.name}</span>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  {col.type}
                </span>
                {col.anomalies.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    col.severity === 'red' 
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300' 
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}>
                    {col.anomalies.length}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {filteredColumns.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
            No columns match your filter.
          </div>
        )}
      </div>

      {/* Sidebar Footer: Upload New CSV / Reset */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40">
        <button
          onClick={onResetWorkspace}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-sm group cursor-pointer"
          title="Upload another CSV file or reset session"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span>Upload Another CSV</span>
        </button>
      </div>

    </aside>
  );
}
