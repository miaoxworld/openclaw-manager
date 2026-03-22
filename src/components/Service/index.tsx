import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Play,
  Square,
  RotateCcw,
  FileText,
  RefreshCw,
  Terminal,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { serviceLogger } from '../../lib/logger';

export function ServiceManager() {
  const [logs, setLogs] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  serviceLogger.debug('ServiceManager 组件渲染');

  const fetchLogs = async () => {
    try {
      const result = await invoke<string[]>('get_logs', { lines: 100 });
      setLogs(result);
      serviceLogger.debug(`获取到 ${result.length} 行日志`);
    } catch (e) {
      serviceLogger.error('获取日志失败', e);
    }
  };

  useEffect(() => {
    serviceLogger.info('ServiceManager 组件挂载');
    fetchLogs();
    if (autoRefresh) {
      serviceLogger.debug('启动日志自动刷新 (间隔: 2秒)');
      const interval = setInterval(fetchLogs, 2000);
      return () => {
        serviceLogger.debug('停止日志自动刷新');
        clearInterval(interval);
      };
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    serviceLogger.action(`服务操作: ${action}`);
    serviceLogger.info(`正在执行: ${action}_service`);
    setActionLoading(action);
    try {
      const result = await invoke(`${action}_service`);
      serviceLogger.info(`✅ ${action} 操作成功`, result);
      await fetchLogs();
    } catch (e) {
      serviceLogger.error(`❌ ${action} 操作失败`, e);
      alert(`操作失败: ${e}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getLogLineClass = (line: string) => {
    if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) {
      return 'text-red-400';
    }
    if (line.includes('warn') || line.includes('Warn') || line.includes('WARN')) {
      return 'text-yellow-400';
    }
    if (line.includes('info') || line.includes('Info') || line.includes('INFO')) {
      return 'text-green-400';
    }
    return 'text-content-secondary';
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 操作按钮栏 */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('start')}
            disabled={actionLoading !== null}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
              'bg-green-500/20 text-green-400 border border-green-500/30',
              'hover:bg-green-500/30 disabled:opacity-50'
            )}
          >
            {actionLoading === 'start' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            启动
          </button>

          <button
            onClick={() => handleAction('stop')}
            disabled={actionLoading !== null}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
              'bg-red-500/20 text-red-400 border border-red-500/30',
              'hover:bg-red-500/30 disabled:opacity-50'
            )}
          >
            {actionLoading === 'stop' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Square size={16} />
            )}
            停止
          </button>

          <button
            onClick={() => handleAction('restart')}
            disabled={actionLoading !== null}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
              'bg-amber-500/20 text-amber-400 border border-amber-500/30',
              'hover:bg-amber-500/30 disabled:opacity-50'
            )}
          >
            {actionLoading === 'restart' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}
            重启
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-edge bg-surface-elevated text-claw-500 focus:ring-claw-500"
            />
            自动刷新
          </label>

          <button
            onClick={fetchLogs}
            className="icon-button text-content-secondary hover:text-content-primary"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* 日志查看器 */}
      <div className="flex-1 bg-surface-sidebar rounded-xl border border-edge overflow-hidden flex flex-col">
        {/* 日志标题栏 */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-card border-b border-edge">
          <Terminal size={14} className="text-content-tertiary" />
          <span className="text-xs text-content-secondary font-medium">
            /tmp/openclaw-gateway.log
          </span>
          <div className="flex-1" />
          <span className="text-xs text-content-tertiary">
            {logs.length} 行
          </span>
        </div>

        {/* 日志内容 */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-content-tertiary">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>暂无日志</p>
              </div>
            </div>
          ) : (
            <>
              {logs.map((line, index) => (
                <div
                  key={index}
                  className={clsx('py-0.5', getLogLineClass(line))}
                >
                  <span className="text-gray-600 mr-3 select-none">
                    {String(index + 1).padStart(4, ' ')}
                  </span>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
