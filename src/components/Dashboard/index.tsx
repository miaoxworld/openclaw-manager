import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { StatusCard } from './StatusCard';
import { QuickActions } from './QuickActions';
import { SystemInfo } from './SystemInfo';
import { api, EnvironmentStatus, ServiceStatus, isTauri } from '../../lib/tauri';
import { Terminal, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

interface DashboardProps {
  envStatus: EnvironmentStatus | null;
  onNavigateToModules: () => void;
}

export function Dashboard({ envStatus, onNavigateToModules }: DashboardProps) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);

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

  // 自动滚动到日志底部（仅在日志容器内部滚动，不影响页面）
  useEffect(() => {
    if (logsExpanded && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, logsExpanded]);

  const handleStart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.startService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('启动失败:', e);
      setActionError(String(e));
      await fetchLogs();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.stopService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('停止失败:', e);
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.restartService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('重启失败:', e);
      setActionError(String(e));
      await fetchLogs();
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

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        <motion.div variants={itemVariants}>
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">模块状态总览</h3>
                <p className="text-sm text-gray-400 mt-1">
                  安装配置入口已升级为模块中心，OpenClaw/Codex/Claude Code 独立管理。
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className={clsx(
                    'px-3 py-1 rounded-full',
                    envStatus?.node_installed && envStatus.node_version_ok
                      ? 'bg-green-500/15 text-green-300'
                      : 'bg-red-500/15 text-red-300'
                  )}>
                    Node.js: {envStatus?.node_version || '未安装'}
                  </span>
                  <span className={clsx(
                    'px-3 py-1 rounded-full',
                    envStatus?.openclaw_installed
                      ? 'bg-green-500/15 text-green-300'
                      : 'bg-yellow-500/15 text-yellow-300'
                  )}>
                    OpenClaw: {envStatus?.openclaw_installed ? (envStatus.openclaw_version || '已安装') : '未安装'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onNavigateToModules}
                  className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors"
                >
                  打开模块中心
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 服务状态卡片 */}
        <motion.div variants={itemVariants}>
          <StatusCard status={status} loading={loading} />
        </motion.div>

        {/* 快捷操作 */}
        <motion.div variants={itemVariants}>
          <QuickActions
            status={status}
            loading={actionLoading}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
          />
        </motion.div>

        {actionError && (
          <motion.div variants={itemVariants}>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              操作失败：{actionError}
            </div>
          </motion.div>
        )}

        {/* 实时日志 */}
        <motion.div variants={itemVariants}>
          <div className="bg-dark-700 rounded-2xl border border-dark-500 overflow-hidden">
            {/* 日志标题栏 */}
            <div 
              className="flex items-center justify-between px-4 py-3 bg-dark-600/50 cursor-pointer"
              onClick={() => setLogsExpanded(!logsExpanded)}
            >
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-white">实时日志</span>
                <span className="text-xs text-gray-500">
                  ({logs.length} 行)
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
                      自动刷新
                    </label>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchLogs();
                      }}
                      className="text-gray-500 hover:text-white"
                      title="刷新日志"
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

            {/* 日志内容 */}
            {logsExpanded && (
              <div ref={logsContainerRef} className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-dark-800">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    <p>暂无日志，请先启动服务</p>
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

                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* 系统信息 */}
        <motion.div variants={itemVariants}>
          <SystemInfo />
        </motion.div>
      </motion.div>
    </div>
  );
}
