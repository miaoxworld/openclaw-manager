import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { Dashboard } from './components/Dashboard';
import { Modules } from './components/Modules';
import { ClaudeCode } from './components/ClaudeCode';
import { Codex } from './components/Codex';
import { AIConfig } from './components/AIConfig';
import { Skills } from './components/Skills';
import { Channels } from './components/Channels';
import { Settings } from './components/Settings';
import { Testing } from './components/Testing';
import { Logs } from './components/Logs';
import { appLogger } from './lib/logger';
import { EnvironmentStatus, isTauri } from './lib/tauri';
import { ModuleType } from './types/modules';

export type TopModuleType = 'openclaw' | 'claudecode' | 'codex';

export type OpenclawSubPageType =
  | 'dashboard'
  | 'ai'
  | 'skills'
  | 'channels'
  | 'testing'
  | 'logs'
  | 'settings';

export type AppViewType =
  | 'module_center'
  | 'openclaw_page'
  | 'claudecode_page'
  | 'codex_page';

export type ClaudeCodeSubPageType = 'overview' | 'install' | 'routes' | 'faq';
export type CodexSubPageType = 'overview' | 'install' | 'routes' | 'faq';

interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
}

function App() {
  const [view, setView] = useState<AppViewType>('module_center');
  const [activeTopModule, setActiveTopModule] = useState<TopModuleType>('openclaw');
  const [openclawExpanded, setOpenclawExpanded] = useState(true);
  const [activeOpenclawSubPage, setActiveOpenclawSubPage] = useState<OpenclawSubPageType>('dashboard');
  const [claudecodeExpanded, setClaudecodeExpanded] = useState(true);
  const [activeClaudeCodeSubPage, setActiveClaudeCodeSubPage] = useState<ClaudeCodeSubPageType>('overview');
  const [codexExpanded, setCodexExpanded] = useState(true);
  const [activeCodexSubPage, setActiveCodexSubPage] = useState<CodexSubPageType>('overview');

  const [isReady, setIsReady] = useState<boolean | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

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

  useEffect(() => {
    appLogger.info('🧩 App 组件已挂载');
    checkEnvironment();
  }, [checkEnvironment]);

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

  const handleOpenOverview = () => {
    appLogger.action('页面切换', { to: 'module_center' });
    setView('module_center');
  };

  const handleToggleOpenclaw = () => {
    setActiveTopModule('openclaw');
    setOpenclawExpanded((prev) => !prev);
  };

  const handleOpenclawSubPage = (subPage: OpenclawSubPageType) => {
    appLogger.action('页面切换', { to: `openclaw/${subPage}` });
    setActiveTopModule('openclaw');
    setOpenclawExpanded(true);
    setActiveOpenclawSubPage(subPage);
    setView('openclaw_page');
  };

  const handleToggleClaudecode = () => {
    setActiveTopModule('claudecode');
    setClaudecodeExpanded((prev) => {
      const next = !prev;
      if (next) {
        setView('claudecode_page');
      }
      return next;
    });
  };

  const handleOpenClaudecodeSubPage = (subPage: ClaudeCodeSubPageType) => {
    appLogger.action('页面切换', { to: `claudecode/${subPage}` });
    setActiveTopModule('claudecode');
    setClaudecodeExpanded(true);
    setActiveClaudeCodeSubPage(subPage);
    setView('claudecode_page');
  };

  const handleToggleCodex = () => {
    setActiveTopModule('codex');
    setCodexExpanded((prev) => {
      const next = !prev;
      if (next) {
        setView('codex_page');
      }
      return next;
    });
  };

  const handleOpenCodexSubPage = (subPage: CodexSubPageType) => {
    appLogger.action('页面切换', { to: `codex/${subPage}` });
    setActiveTopModule('codex');
    setCodexExpanded(true);
    setActiveCodexSubPage(subPage);
    setView('codex_page');
  };

  const handleOpenFromModuleCenter = (moduleId: ModuleType) => {
    if (moduleId === 'openclaw') {
      handleOpenclawSubPage('dashboard');
      return;
    }

    if (moduleId === 'claudecode') {
      handleOpenClaudecodeSubPage('overview');
      return;
    }

    handleOpenCodexSubPage('overview');
  };

  const renderOpenclawPage = () => {
    const pages: Record<OpenclawSubPageType, JSX.Element> = {
      dashboard: <Dashboard envStatus={envStatus} onNavigateToModules={handleOpenOverview} />,
      ai: <AIConfig />,
      skills: (
        <Skills
          envStatus={envStatus}
          onNavigateToSettings={() => handleOpenclawSubPage('settings')}
          onNavigateToSetup={handleOpenOverview}
        />
      ),
      channels: <Channels />,
      testing: <Testing />,
      logs: <Logs />,
      settings: (
        <Settings
          onEnvironmentChange={checkEnvironment}
          onNavigateToPage={handleOpenclawSubPage}
        />
      ),
    };

    return pages[activeOpenclawSubPage];
  };

  const renderPage = () => {
    const pageVariants = {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
    };

    const pageMap: Record<AppViewType, JSX.Element> = {
      module_center: <Modules envStatus={envStatus} onOpenModule={handleOpenFromModuleCenter} />,
      openclaw_page: renderOpenclawPage(),
      claudecode_page: (
        <ClaudeCode
          section={activeClaudeCodeSubPage}
          onNavigateSection={handleOpenClaudecodeSubPage}
        />
      ),
      codex_page: (
        <Codex
          section={activeCodexSubPage}
          onNavigateSection={handleOpenCodexSubPage}
        />
      ),
    };

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view}-${activeTopModule}-${activeOpenclawSubPage}-${activeClaudeCodeSubPage}-${activeCodexSubPage}`}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {pageMap[view]}
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
            <span className="text-3xl">🧩</span>
          </div>
          <p className="text-dark-400">正在启动...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />

      <Sidebar
        view={view}
        activeTopModule={activeTopModule}
        openclawExpanded={openclawExpanded}
        activeOpenclawSubPage={activeOpenclawSubPage}
        claudecodeExpanded={claudecodeExpanded}
        activeClaudeCodeSubPage={activeClaudeCodeSubPage}
        codexExpanded={codexExpanded}
        activeCodexSubPage={activeCodexSubPage}
        onOpenOverview={handleOpenOverview}
        onToggleOpenclaw={handleToggleOpenclaw}
        onOpenclawSubPage={handleOpenclawSubPage}
        onToggleClaudecode={handleToggleClaudecode}
        onOpenClaudecodeSubPage={handleOpenClaudecodeSubPage}
        onToggleCodex={handleToggleCodex}
        onOpenCodexSubPage={handleOpenCodexSubPage}
        serviceStatus={serviceStatus}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          view={view}
          activeTopModule={activeTopModule}
          activeOpenclawSubPage={activeOpenclawSubPage}
          activeClaudeCodeSubPage={activeClaudeCodeSubPage}
          activeCodexSubPage={activeCodexSubPage}
        />

        <main className="flex-1 overflow-hidden p-6">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
