import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { Dashboard } from './components/Dashboard';
import { AIConfig } from './components/AIConfig';
import { Channels } from './components/Channels';
import { Settings } from './components/Settings';
import { Testing } from './components/Testing';
import { Logs } from './components/Logs';
import { appLogger } from './lib/logger';
import { isTauri } from './lib/tauri';
import { Download, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export type PageType = 'dashboard' | 'ai' | 'channels' | 'testing' | 'logs' | 'settings';

export interface EnvironmentStatus {
  node_installed: boolean;
  node_version: string | null;
  node_version_ok: boolean;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  config_dir_exists: boolean;
  ready: boolean;
  os: string;
}

interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
}

interface UpdateInfo {
  update_available: boolean;
  current_version: string | null;
  latest_version: string | null;
  error: string | null;
}

interface UpdateResult {
  success: boolean;
  message: string;
  error?: string;
}

function App() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [isReady, setIsReady] = useState<boolean | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  // 更新相关状态
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  // 检查环境
  const checkEnvironment = useCallback(async () => {
    if (!isTauri()) {
      appLogger.warn('不在 Tauri 环境中，跳过环境检查');
      setIsReady(true);
      return;
    }

    appLogger.info('开始检查系统环境...');
    try {
      const status = await invoke<EnvironmentStatus>('check_environment');
      appLogger.info('环境检查完成', status);
      setEnvStatus(status);
      setIsReady(true);
    } catch (e) {
      appLogger.error('环境检查失败', e);
      setIsReady(true);
    }
  }, []);

  // 检查更新
  const checkUpdate = useCallback(async () => {
    if (!isTauri()) return;

    appLogger.info('检查 OpenClaw 更新...');
    try {
      const info = await invoke<UpdateInfo>('check_openclaw_update');
      appLogger.info('更新检查结果', info);
      setUpdateInfo(info);
      if (info.update_available) {
        setShowUpdateBanner(true);
      }
    } catch (e) {
      appLogger.error('检查更新失败', e);
    }
  }, []);

  // 执行更新
  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await invoke<UpdateResult>('update_openclaw');
      setUpdateResult(result);
      if (result.success) {
        await checkEnvironment();
        setTimeout(() => {
          setShowUpdateBanner(false);
          setUpdateResult(null);
        }, 3000);
      }
    } catch (e) {
      setUpdateResult({
        success: false,
        message: t('app.updateError'),
        error: String(e),
      });
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    appLogger.info('🦞 App 组件已挂载');
    checkEnvironment();
  }, [checkEnvironment]);

  useEffect(() => {
    if (!isTauri()) return;
    const timer = setTimeout(() => {
      checkUpdate();
    }, 2000);
    return () => clearTimeout(timer);
  }, [checkUpdate]);

  useEffect(() => {
    if (!isTauri()) return;

    const fetchServiceStatus = async () => {
      try {
        const status = await invoke<ServiceStatus>('get_service_status');
        setServiceStatus(status);
      } catch {
        // 静默处理轮询错误
      }
    };
    fetchServiceStatus();
    const interval = setInterval(fetchServiceStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSetupComplete = useCallback(() => {
    appLogger.info('安装向导完成');
    checkEnvironment();
  }, [checkEnvironment]);

  const handleNavigate = (page: PageType) => {
    appLogger.action('页面切换', { from: currentPage, to: page });
    setCurrentPage(page);
  };

  const renderPage = () => {
    const pageVariants = {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
    };

    const pages: Record<PageType, JSX.Element> = {
      dashboard: <Dashboard envStatus={envStatus} onSetupComplete={handleSetupComplete} />,
      ai: <AIConfig />,
      channels: <Channels />,
      testing: <Testing />,
      logs: <Logs />,
      settings: <Settings onEnvironmentChange={checkEnvironment} />,
    };

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {pages[currentPage]}
        </motion.div>
      </AnimatePresence>
    );
  };

  if (isReady === null) {
    return (
      <div className="flex h-screen bg-dark-900 items-center justify-center">
        <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 mb-4 animate-pulse">
            <span className="text-3xl">🦞</span>
          </div>
          <p className="text-dark-400">{t('app.starting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />

      <AnimatePresence>
        {showUpdateBanner && updateInfo?.update_available && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-claw-600 to-purple-600 shadow-lg"
          >
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {updateResult?.success ? (
                  <CheckCircle size={20} className="text-green-300" />
                ) : updateResult && !updateResult.success ? (
                  <AlertCircle size={20} className="text-red-300" />
                ) : (
                  <Download size={20} className="text-white" />
                )}
                <div>
                  {updateResult ? (
                    <p className={`text-sm font-medium ${updateResult.success ? 'text-green-100' : 'text-red-100'}`}>
                      {updateResult.message}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-white">
                        {t('app.newVersion', { version: updateInfo.latest_version })}
                      </p>
                      <p className="text-xs text-white/70">
                        {t('app.currentVersion', { version: updateInfo.current_version })}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!updateResult && (
                  <button
                    onClick={handleUpdate}
                    disabled={updating}
                    className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {updating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t('app.updating')}
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        {t('app.updateNow')}
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowUpdateBanner(false);
                    setUpdateResult(null);
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white/70 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} serviceStatus={serviceStatus} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header currentPage={currentPage} />

        <main className="flex-1 overflow-hidden p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
