import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Loader2,
  Download,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Cpu,
  Package
} from 'lucide-react';
import { setupLogger } from '../../lib/logger';

interface EnvironmentStatus {
  node_installed: boolean;
  node_version: string | null;
  node_version_ok: boolean;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  config_dir_exists: boolean;
  ready: boolean;
  os: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  error: string | null;
}

interface SetupProps {
  onComplete: () => void;
  /** 是否嵌入模式（嵌入到 Dashboard 中显示） */
  embedded?: boolean;
}

export function Setup({ onComplete, embedded = false }: SetupProps) {
  const { t } = useTranslation();
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState<'nodejs' | 'openclaw' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'check' | 'install' | 'complete'>('check');

  const checkEnvironment = async () => {
    setupLogger.info('检查系统环境...');
    setChecking(true);
    setError(null);
    try {
      const status = await invoke<EnvironmentStatus>('check_environment');
      setupLogger.state('环境状态', status);
      setEnvStatus(status);

      if (status.ready) {
        setupLogger.info('✅ 环境就绪');
        setStep('complete');
        // 延迟一下再跳转，让用户看到成功状态
        setTimeout(() => onComplete(), 1500);
      } else {
        setupLogger.warn('环境未就绪，需要安装依赖');
        setStep('install');
      }
    } catch (e) {
      setupLogger.error('检查环境失败', e);
      setError(t('setup.checkFailed', { error: e }));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setupLogger.info('Setup 组件初始化');
    checkEnvironment();
  }, []);

  const handleInstallNodejs = async () => {
    setupLogger.action('安装 Node.js');
    setupLogger.info('开始安装 Node.js...');
    setInstalling('nodejs');
    setError(null);

    try {
      // 先尝试直接安装
      const result = await invoke<InstallResult>('install_nodejs');

      if (result.success) {
        setupLogger.info('✅ Node.js 安装成功');
        // 重新检查环境
        await checkEnvironment();
      } else if (result.message.includes('重启')) {
        // 需要重启应用
        setError(t('setup.installComplete'));
      } else {
        // 打开终端手动安装
        await invoke<string>('open_install_terminal', { installType: 'nodejs' });
        setError(t('setup.terminalOpened'));
      }
    } catch (e) {
      // 如果自动安装失败，打开终端
      try {
        await invoke<string>('open_install_terminal', { installType: 'nodejs' });
        setError(t('setup.terminalOpened'));
      } catch (termErr) {
        setError(t('setup.installFailed', { error: e }) + `。${termErr}`);
      }
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallOpenclaw = async () => {
    setupLogger.action('安装 OpenClaw');
    setupLogger.info('开始安装 OpenClaw...');
    setInstalling('openclaw');
    setError(null);

    try {
      const result = await invoke<InstallResult>('install_openclaw');

      if (result.success) {
        setupLogger.info('✅ OpenClaw 安装成功，初始化配置...');
        // 初始化配置
        await invoke<InstallResult>('init_openclaw_config');
        setupLogger.info('✅ 配置初始化完成');
        // 重新检查环境
        await checkEnvironment();
      } else {
        setupLogger.warn('自动安装失败，打开终端手动安装');
        // 打开终端手动安装
        await invoke<string>('open_install_terminal', { installType: 'openclaw' });
        setError(t('setup.terminalOpened'));
      }
    } catch (e) {
      setupLogger.error('安装失败，尝试打开终端', e);
      try {
        await invoke<string>('open_install_terminal', { installType: 'openclaw' });
        setError(t('setup.terminalOpened'));
      } catch (termErr) {
        setError(t('setup.installFailed', { error: e }) + `。${termErr}`);
      }
    } finally {
      setInstalling(null);
    }
  };

  const getOsName = (os: string) => {
    switch (os) {
      case 'windows': return 'Windows';
      case 'macos': return 'macOS';
      case 'linux': return 'Linux';
      default: return os;
    }
  };

  // 渲染安装内容（复用于嵌入模式和全屏模式）
  const renderContent = () => {
    return (
      <AnimatePresence mode="wait">
        {/* 检查中状态 */}
        {checking && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-6"
          >
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-dark-300">{t('setup.checkingEnv')}</p>
          </motion.div>
        )}

        {/* 安装步骤 */}
        {!checking && step === 'install' && envStatus && (
          <motion.div
            key="install"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* 系统信息（仅非嵌入模式） */}
            {!embedded && (
              <div className="flex items-center justify-between text-sm text-dark-400 pb-4 border-b border-dark-700">
                <span>{t('setup.os')}</span>
                <span className="text-dark-200">{getOsName(envStatus.os)}</span>
              </div>
            )}

            {/* Node.js 状态 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  envStatus.node_installed && envStatus.node_version_ok
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">Node.js</p>
                  <p className="text-sm text-dark-400">
                    {envStatus.node_version
                      ? `${envStatus.node_version} ${envStatus.node_version_ok ? '✓' : `(${t('setup.needsV22')})`}`
                      : t('setup.notInstalled')}
                  </p>
                </div>
              </div>

              {envStatus.node_installed && envStatus.node_version_ok ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <button
                  onClick={handleInstallNodejs}
                  disabled={installing !== null}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                >
                  {installing === 'nodejs' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('setup.installing')}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t('setup.install')}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* OpenClaw 状态 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  envStatus.openclaw_installed
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">OpenClaw</p>
                  <p className="text-sm text-dark-400">
                    {envStatus.openclaw_version || t('setup.notInstalled')}
                  </p>
                </div>
              </div>

              {envStatus.openclaw_installed ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <button
                  onClick={handleInstallOpenclaw}
                  disabled={installing !== null || !envStatus.node_version_ok}
                  className={`btn-primary text-sm px-4 py-2 flex items-center gap-2 ${
                    !envStatus.node_version_ok ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={!envStatus.node_version_ok ? '请先安装 Node.js' : ''}
                >
                  {installing === 'openclaw' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('setup.installing')}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t('setup.install')}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* 错误信息 */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
              >
                <p className="text-yellow-400 text-sm">{error}</p>
              </motion.div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-4 border-t border-dark-700/50">
              <button
                onClick={checkEnvironment}
                disabled={checking || installing !== null}
                className="flex-1 btn-secondary py-2.5 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                {t('setup.recheck')}
              </button>

              {envStatus.ready && (
                <button
                  onClick={onComplete}
                  className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2"
                >
                  {t('setup.getStarted')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 帮助链接 */}
            <div className="text-center pt-1">
              <a
                href="https://nodejs.org/en/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-dark-400 hover:text-brand-400 transition-colors inline-flex items-center gap-1"
              >
                {t('setup.downloadNodejs')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        )}

        {/* 完成状态 */}
        {!checking && step === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 0.1 }}
            >
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            </motion.div>
            <h3 className="text-lg font-bold text-white mb-1">{t('setup.envReady')}</h3>
            <p className="text-dark-400 text-sm">
              {t('setup.envReadyDesc')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // 嵌入模式：作为卡片显示在 Dashboard 中
  if (embedded) {
    return (
      <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">{t('setup.envSetup')}</h2>
            <p className="text-dark-400 text-sm">{t('setup.missingDeps')}</p>
          </div>
        </div>

        {renderContent()}
      </div>
    );
  }

  // 全屏模式（保留用于特殊情况）
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-8">
      {/* 背景装饰 */}
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* Logo 和标题 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 mb-4 shadow-lg shadow-brand-500/25"
          >
            <span className="text-4xl">🦞</span>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">OpenClaw Manager</h1>
          <p className="text-dark-400">{t('setup.setupWizard')}</p>
        </div>

        {/* 主卡片 */}
        <motion.div
          layout
          className="glass-card rounded-2xl p-6 shadow-xl"
        >
          {renderContent()}
        </motion.div>

        {/* 版本信息 */}
        <p className="text-center text-dark-500 text-xs mt-6">
          OpenClaw Manager v0.0.5
        </p>
      </motion.div>
    </div>
  );
}
