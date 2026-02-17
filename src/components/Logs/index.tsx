import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Trash2,
  RefreshCw,
  Download,
  Filter,
  Terminal,
} from 'lucide-react';
import clsx from 'clsx';
import { logStore, LogEntry } from '../../lib/logger';

type FilterLevel = 'all' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-green-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
  debug: 'bg-gray-500/10',
  info: 'bg-green-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
};

const MODULE_COLORS: Record<string, string> = {
  App: 'text-purple-400',
  Service: 'text-blue-400',
  Config: 'text-emerald-400',
  AI: 'text-pink-400',
  Channel: 'text-orange-400',
  Setup: 'text-cyan-400',
  Dashboard: 'text-lime-400',
  Testing: 'text-fuchsia-400',
  API: 'text-amber-400',
};

export function Logs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<FilterLevel>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 订阅日志更新
  useEffect(() => {
    const updateLogs = () => {
      setLogs(logStore.getAll());
    };

    updateLogs(); // 初始加载
    return logStore.subscribe(updateLogs);
  }, []);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // 过滤日志
  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
    return true;
  });

  // 获取所有模块
  const modules = [...new Set(logs.map(log => log.module))];

  // 清除日志
  const handleClear = () => {
    logStore.clear();
  };

  // 导出日志
  const handleExport = () => {
    const content = filteredLogs.map(log => {
      const time = log.timestamp.toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const args = log.args.length > 0 ? ' ' + JSON.stringify(log.args) : '';
      return `[${time}] [${log.level.toUpperCase()}] [${log.module}] ${log.message}${args}`;
    }).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openclaw-manager-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  // 格式化参数
  const formatArgs = (args: unknown[]): string => {
    if (args.length === 0) return '';
    try {
      return args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      }).join(' ');
    } catch {
      return t('logs.cannotSerialize');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {/* 级别过滤 */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterLevel)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-gray-300"
          >
            <option value="all">{t('logs.allLevels')}</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* 模块过滤 */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-gray-300"
        >
          <option value="all">{t('logs.allModules')}</option>
          {modules.map(module => (
            <option key={module} value={module}>{module}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* 统计 */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{t('logs.entries', { filtered: filteredLogs.length, total: logs.length })}</span>
          <span className="text-red-400">{t('logs.errors', { count: logs.filter(l => l.level === 'error').length })}</span>
          <span className="text-yellow-400">{t('logs.warnings', { count: logs.filter(l => l.level === 'warn').length })}</span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3 rounded"
            />
            {t('logs.autoScroll')}
          </label>
          <button
            onClick={handleExport}
            className="icon-button text-gray-400 hover:text-white"
            title={t('logs.exportLogs')}
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => setLogs(logStore.getAll())}
            className="icon-button text-gray-400 hover:text-white"
            title={t('logs.refresh')}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleClear}
            className="icon-button text-gray-400 hover:text-red-400"
            title={t('logs.clearLogs')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="flex-1 bg-dark-800 rounded-xl border border-dark-600 overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-4 py-2 bg-dark-700 border-b border-dark-600">
          <Terminal size={14} className="text-gray-500" />
          <span className="text-xs text-gray-400 font-medium">{t('logs.appLogs')}</span>
        </div>

        {/* 日志内容 */}
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Terminal size={32} className="mx-auto mb-2 opacity-50" />
                <p>{t('logs.noLogs')}</p>
              </div>
            </div>
          ) : (
            <>
              {filteredLogs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={clsx(
                    'py-1.5 px-2 rounded mb-1',
                    LEVEL_BG[log.level]
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-600 flex-shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] uppercase flex-shrink-0',
                      LEVEL_COLORS[log.level]
                    )}>
                      {log.level}
                    </span>
                    <span className={clsx(
                      'flex-shrink-0',
                      MODULE_COLORS[log.module] || 'text-gray-400'
                    )}>
                      [{log.module}]
                    </span>
                    <span className="text-gray-300 break-all">
                      {log.message}
                    </span>
                  </div>
                  {log.args.length > 0 && (
                    <div className="mt-1 ml-20 text-gray-500 break-all whitespace-pre-wrap">
                      {formatArgs(log.args)}
                    </div>
                  )}
                </motion.div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
