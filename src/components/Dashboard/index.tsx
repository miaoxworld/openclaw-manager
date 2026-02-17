import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { StatusCard } from './StatusCard';
import { QuickActions } from './QuickActions';
import { SystemInfo } from './SystemInfo';
import { Setup } from '../Setup';
import { api, ServiceStatus, isTauri } from '../../lib/tauri';
import { Terminal, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { EnvironmentStatus } from '../../App';

interface DashboardProps {
  envStatus: EnvironmentStatus | null;
  onSetupComplete: () => void;
}

export function Dashboard({ envStatus, onSetupComplete }: DashboardProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const result = await api.getServiceStatus();
      setStatus(result);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (!isTauri()) return;
    try {
      const result = await invoke<string[]>('get_logs', { lines: 50 });
      setLogs(result);
    } catch {
      // 静默处理
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    if (!isTauri()) return;

    const statusInterval = setInterval(fetchStatus, 3000);
    const logsInterval = autoRefreshLogs ? setInterval(fetchLogs, 2000) : null;

    return () => {
      clearInterval(statusInterval);
      if (logsInterval) clearInterval(logsInterval);
    };
  }, [autoRefreshLogs]);

  useEffect(() => {
    if (logsExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, logsExpanded]);

  const handleStart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.startService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('启动失败:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.stopService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('停止失败:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.restartService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('重启失败:', e);
    } finally {
      setActionLoading(false);
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
    return 'text-gray-400';
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  const needsSetup = envStatus && !envStatus.ready;

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {needsSetup && (
          <motion.div variants={itemVariants}>
            <Setup onComplete={onSetupComplete} embedded />
          </motion.div>
        )}

        <motion.div variants={itemVariants}>
          <StatusCard status={status} loading={loading} />
        </motion.div>

        <motion.div variants={itemVariants}>
          <QuickActions
            status={status}
            loading={actionLoading}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="bg-dark-700 rounded-2xl border border-dark-500 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 bg-dark-600/50 cursor-pointer"
              onClick={() => setLogsExpanded(!logsExpanded)}
            >
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-white">{t('dashboard.liveLogs')}</span>
                <span className="text-xs text-gray-500">
                  ({t('dashboard.lines', { count: logs.length })})
                </span>
              </div>
              <div className="flex items-center gap-3">
                {logsExpanded && (
                  <>
                    <label
                      className="flex items-center gap-2 text-xs text-gray-400"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={autoRefreshLogs}
                        onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                        className="w-3 h-3 rounded border-dark-500 bg-dark-600 text-claw-500"
                      />
                      {t('dashboard.autoRefresh')}
                    </label>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchLogs();
                      }}
                      className="text-gray-500 hover:text-white"
                      title={t('dashboard.refreshLogs')}
                    >
                      <RefreshCw size={14} />
                    </button>
                  </>
                )}
                {logsExpanded ? (
                  <ChevronUp size={16} className="text-gray-500" />
                ) : (
                  <ChevronDown size={16} className="text-gray-500" />
                )}
              </div>
            </div>

            {logsExpanded && (
              <div className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-dark-800">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <p>{t('dashboard.noLogs')}</p>
                  </div>
                ) : (
                  <>
                    {logs.map((line, index) => (
                      <div
                        key={index}
                        className={clsx('py-0.5 whitespace-pre-wrap break-all', getLogLineClass(line))}
                      >
                        {line}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <SystemInfo />
        </motion.div>
      </motion.div>
    </div>
  );
}
