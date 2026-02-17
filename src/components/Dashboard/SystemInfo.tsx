import { useEffect, useState } from 'react';
import { Monitor, Package, Folder, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, SystemInfo as SystemInfoType, isTauri } from '../../lib/tauri';

export function SystemInfo() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfoType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInfo = async () => {
      if (!isTauri()) {
        setLoading(false);
        return;
      }
      try {
        const result = await api.getSystemInfo();
        setInfo(result);
      } catch {
        // 静默处理
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, []);

  const getOSLabel = (os: string) => {
    switch (os) {
      case 'macos':
        return 'macOS';
      case 'windows':
        return 'Windows';
      case 'linux':
        return 'Linux';
      default:
        return os;
    }
  };

  if (loading) {
    return (
      <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
        <h3 className="text-lg font-semibold text-white mb-4">{t('systemInfo.title')}</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-dark-500 rounded w-1/2"></div>
          <div className="h-4 bg-dark-500 rounded w-2/3"></div>
          <div className="h-4 bg-dark-500 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
      <h3 className="text-lg font-semibold text-white mb-4">{t('systemInfo.title')}</h3>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center">
            <Monitor size={16} className="text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">{t('systemInfo.os')}</p>
            <p className="text-sm text-white">
              {info ? `${getOSLabel(info.os)} ${info.os_version}` : '--'}{' '}
              <span className="text-gray-500">({info?.arch})</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center">
            {info?.openclaw_installed ? (
              <CheckCircle size={16} className="text-green-400" />
            ) : (
              <XCircle size={16} className="text-red-400" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">OpenClaw</p>
            <p className="text-sm text-white">
              {info?.openclaw_installed
                ? info.openclaw_version || t('systemInfo.installed')
                : t('systemInfo.notInstalled')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center">
            <Package size={16} className="text-green-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">Node.js</p>
            <p className="text-sm text-white">{info?.node_version || '--'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center">
            <Folder size={16} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">{t('systemInfo.configDir')}</p>
            <p className="text-sm text-white font-mono text-xs truncate">
              {info?.config_dir || '--'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
