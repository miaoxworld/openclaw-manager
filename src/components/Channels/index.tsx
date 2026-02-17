import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  MessageCircle,
  Hash,
  Slack,
  MessagesSquare,
  MessageSquare,
  Check,
  X,
  Loader2,
  ChevronRight,
  Apple,
  Bell,
  Eye,
  EyeOff,
  Play,
  QrCode,
  CheckCircle,
  XCircle,
  Download,
  Package,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';

interface FeishuPluginStatus {
  installed: boolean;
  version: string | null;
  plugin_name: string | null;
}

interface ChannelConfig {
  id: string;
  channel_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

// 渠道配置字段定义
interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
  error: string | null;
}

export function Channels() {
  const { t } = useTranslation();

  const channelInfo: Record<
    string,
    {
      name: string;
      icon: React.ReactNode;
      color: string;
      fields: ChannelField[];
      helpText?: string;
    }
  > = {
    telegram: {
      name: 'Telegram',
      icon: <MessageCircle size={20} />,
      color: 'text-blue-400',
      fields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: t('channels.telegram.botTokenPlaceholder'), required: true },
        { key: 'userId', label: 'User ID', type: 'text', placeholder: t('channels.telegram.userIdPlaceholder'), required: true },
        { key: 'dmPolicy', label: t('channels.telegram.dmPolicy'), type: 'select', options: [
          { value: 'pairing', label: t('channels.policyPairing') },
          { value: 'open', label: t('channels.policyOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
        { key: 'groupPolicy', label: t('channels.telegram.groupPolicy'), type: 'select', options: [
          { value: 'allowlist', label: t('channels.groupAllowlist') },
          { value: 'open', label: t('channels.groupOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
      ],
      helpText: t('channels.telegram.helpText'),
    },
    discord: {
      name: 'Discord',
      icon: <Hash size={20} />,
      color: 'text-indigo-400',
      fields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Bot Token', required: true },
        { key: 'testChannelId', label: t('channels.discord.testChannelId'), type: 'text', placeholder: t('channels.discord.testChannelIdPlaceholder') },
        { key: 'dmPolicy', label: t('channels.discord.dmPolicy'), type: 'select', options: [
          { value: 'pairing', label: t('channels.policyPairing') },
          { value: 'open', label: t('channels.policyOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
      ],
      helpText: t('channels.discord.helpText'),
    },
    slack: {
      name: 'Slack',
      icon: <Slack size={20} />,
      color: 'text-purple-400',
      fields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...', required: true },
        { key: 'appToken', label: 'App Token', type: 'password', placeholder: 'xapp-...' },
        { key: 'testChannelId', label: t('channels.slack.testChannelId'), type: 'text', placeholder: t('channels.slack.testChannelIdPlaceholder') },
      ],
      helpText: t('channels.slack.helpText'),
    },
    feishu: {
      name: t('channels.feishu.name'),
      icon: <MessagesSquare size={20} />,
      color: 'text-blue-500',
      fields: [
        { key: 'appId', label: 'App ID', type: 'text', placeholder: t('channels.feishu.appIdPlaceholder'), required: true },
        { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: t('channels.feishu.appSecretPlaceholder'), required: true },
        { key: 'testChatId', label: t('channels.feishu.testChatId'), type: 'text', placeholder: t('channels.feishu.testChatIdPlaceholder') },
        { key: 'connectionMode', label: t('channels.feishu.connectionMode'), type: 'select', options: [
          { value: 'websocket', label: t('channels.feishu.websocket') },
          { value: 'webhook', label: t('channels.feishu.webhook') },
        ]},
        { key: 'domain', label: t('channels.feishu.domain'), type: 'select', options: [
          { value: 'feishu', label: t('channels.feishu.domestic') },
          { value: 'lark', label: t('channels.feishu.overseas') },
        ]},
        { key: 'requireMention', label: t('channels.feishu.requireMention'), type: 'select', options: [
          { value: 'true', label: t('channels.feishu.yes') },
          { value: 'false', label: t('channels.feishu.no') },
        ]},
      ],
      helpText: t('channels.feishu.helpText'),
    },
    imessage: {
      name: 'iMessage',
      icon: <Apple size={20} />,
      color: 'text-green-400',
      fields: [
        { key: 'dmPolicy', label: t('channels.imessage.dmPolicy'), type: 'select', options: [
          { value: 'pairing', label: t('channels.policyPairing') },
          { value: 'open', label: t('channels.policyOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
        { key: 'groupPolicy', label: t('channels.imessage.groupPolicy'), type: 'select', options: [
          { value: 'allowlist', label: t('channels.groupAllowlist') },
          { value: 'open', label: t('channels.groupOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
      ],
      helpText: t('channels.imessage.helpText'),
    },
    whatsapp: {
      name: 'WhatsApp',
      icon: <MessageCircle size={20} />,
      color: 'text-green-500',
      fields: [
        { key: 'dmPolicy', label: t('channels.whatsapp.dmPolicy'), type: 'select', options: [
          { value: 'pairing', label: t('channels.policyPairing') },
          { value: 'open', label: t('channels.policyOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
        { key: 'groupPolicy', label: t('channels.whatsapp.groupPolicy'), type: 'select', options: [
          { value: 'allowlist', label: t('channels.groupAllowlist') },
          { value: 'open', label: t('channels.groupOpen') },
          { value: 'disabled', label: t('channels.policyDisabled') },
        ]},
      ],
      helpText: t('channels.whatsapp.helpText'),
    },
    wechat: {
      name: t('channels.wechat.name'),
      icon: <MessageSquare size={20} />,
      color: 'text-green-600',
      fields: [
        { key: 'appId', label: 'App ID', type: 'text', placeholder: t('channels.wechat.appIdPlaceholder') },
        { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: t('channels.wechat.appSecretPlaceholder') },
      ],
      helpText: t('channels.wechat.helpText'),
    },
    dingtalk: {
      name: t('channels.dingtalk.name'),
      icon: <Bell size={20} />,
      color: 'text-blue-600',
      fields: [
        { key: 'appKey', label: 'App Key', type: 'text', placeholder: t('channels.dingtalk.appKeyPlaceholder') },
        { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: t('channels.dingtalk.appSecretPlaceholder') },
      ],
      helpText: t('channels.dingtalk.helpText'),
    },
  };

  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 飞书插件状态
  const [feishuPluginStatus, setFeishuPluginStatus] = useState<FeishuPluginStatus | null>(null);
  const [feishuPluginLoading, setFeishuPluginLoading] = useState(false);
  const [feishuPluginInstalling, setFeishuPluginInstalling] = useState(false);

  // 跟踪哪些密码字段显示明文
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const togglePasswordVisibility = (fieldKey: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  // 检查飞书插件状态
  const checkFeishuPlugin = async () => {
    setFeishuPluginLoading(true);
    try {
      const status = await invoke<FeishuPluginStatus>('check_feishu_plugin');
      setFeishuPluginStatus(status);
    } catch (e) {
      console.error('检查飞书插件失败:', e);
      setFeishuPluginStatus({ installed: false, version: null, plugin_name: null });
    } finally {
      setFeishuPluginLoading(false);
    }
  };

  // 安装飞书插件
  const handleInstallFeishuPlugin = async () => {
    setFeishuPluginInstalling(true);
    try {
      const result = await invoke<string>('install_feishu_plugin');
      alert(result);
      // 刷新插件状态
      await checkFeishuPlugin();
    } catch (e) {
      alert(t('setup.installFailed', { error: e }));
    } finally {
      setFeishuPluginInstalling(false);
    }
  };

  // 显示清空确认
  const handleShowClearConfirm = () => {
    if (!selectedChannel) return;
    setShowClearConfirm(true);
  };

  // 执行清空渠道配置
  const handleClearConfig = async () => {
    if (!selectedChannel) return;

    const channel = channels.find((c) => c.id === selectedChannel);
    const channelName = channel ? channelInfo[channel.channel_type]?.name || channel.channel_type : selectedChannel;

    setShowClearConfirm(false);
    setClearing(true);
    try {
      await invoke('clear_channel_config', { channelId: selectedChannel });
      // 清空表单
      setConfigForm({});
      // 刷新列表
      await fetchChannels();
      setTestResult({
        success: true,
        message: t('channels.configCleared', { name: channelName }),
        error: null,
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: t('channels.clearFailed'),
        error: String(e),
      });
    } finally {
      setClearing(false);
    }
  };

  // 快速测试
  const handleQuickTest = async () => {
    if (!selectedChannel) return;

    setTesting(true);
    setTestResult(null);

    try {
      const result = await invoke<{
        success: boolean;
        channel: string;
        message: string;
        error: string | null;
      }>('test_channel', { channelType: selectedChannel });

      setTestResult({
        success: result.success,
        message: result.message,
        error: result.error,
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: t('channels.testFailed'),
        error: String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  // WhatsApp 扫码登录
  const handleWhatsAppLogin = async () => {
    setLoginLoading(true);
    try {
      // 调用后端命令启动 WhatsApp 登录
      await invoke('start_channel_login', { channelType: 'whatsapp' });

      // 开始轮询检查登录状态
      const pollInterval = setInterval(async () => {
        try {
          const result = await invoke<{
            success: boolean;
            message: string;
          }>('test_channel', { channelType: 'whatsapp' });

          if (result.success) {
            clearInterval(pollInterval);
            setLoginLoading(false);
            // 刷新渠道列表
            await fetchChannels();
            setTestResult({
              success: true,
              message: t('channels.whatsapp.loginSuccess'),
              error: null,
            });
          }
        } catch {
          // 继续轮询
        }
      }, 3000); // 每3秒检查一次

      // 60秒后停止轮询
      setTimeout(() => {
        clearInterval(pollInterval);
        setLoginLoading(false);
      }, 60000);

      alert(t('channels.whatsapp.loginPrompt'));
    } catch (e) {
      alert(t('channels.whatsapp.loginFailed') + e);
      setLoginLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const result = await invoke<ChannelConfig[]>('get_channels_config');
      setChannels(result);
      return result;
    } catch (e) {
      console.error('获取渠道配置失败:', e);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const result = await fetchChannels();

        // 自动选择第一个已配置的渠道
        const configured = result.find((c) => c.enabled);
        if (configured) {
          handleChannelSelect(configured.id, result);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleChannelSelect = (channelId: string, channelList?: ChannelConfig[]) => {
    setSelectedChannel(channelId);
    setTestResult(null); // 清除测试结果

    const list = channelList || channels;
    const channel = list.find((c) => c.id === channelId);

    if (channel) {
      const form: Record<string, string> = {};
      Object.entries(channel.config).forEach(([key, value]) => {
        // 处理布尔值
        if (typeof value === 'boolean') {
          form[key] = value ? 'true' : 'false';
        } else {
          form[key] = String(value ?? '');
        }
      });
      setConfigForm(form);

      // 如果选择的是飞书渠道，检查插件状态
      if (channel.channel_type === 'feishu') {
        checkFeishuPlugin();
      }
    } else {
      setConfigForm({});
    }
  };

  const handleSave = async () => {
    if (!selectedChannel) return;

    setSaving(true);
    try {
      const channel = channels.find((c) => c.id === selectedChannel);
      if (!channel) return;

      // 转换表单值
      const config: Record<string, unknown> = {};
      Object.entries(configForm).forEach(([key, value]) => {
        if (value === 'true') {
          config[key] = true;
        } else if (value === 'false') {
          config[key] = false;
        } else if (value) {
          config[key] = value;
        }
      });

      await invoke('save_channel_config', {
        channel: {
          ...channel,
          config,
        },
      });

      // 刷新列表
      await fetchChannels();

      alert(t('channels.configSaved'));
    } catch (e) {
      console.error('保存失败:', e);
      alert(t('channels.saveFailed', { error: e }));
    } finally {
      setSaving(false);
    }
  };

  const currentChannel = channels.find((c) => c.id === selectedChannel);
  const currentInfo = currentChannel ? channelInfo[currentChannel.channel_type] : null;

  // 检查渠道是否有有效配置
  const hasValidConfig = (channel: ChannelConfig) => {
    const info = channelInfo[channel.channel_type];
    if (!info) return channel.enabled;

    // 检查是否有必填字段已填写
    const requiredFields = info.fields.filter((f) => f.required);
    if (requiredFields.length === 0) return channel.enabled;

    return requiredFields.some((field) => {
      const value = channel.config[field.key];
      return value !== undefined && value !== null && value !== '';
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-claw-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 渠道列表 */}
          <div className="md:col-span-1 space-y-2">
            <h3 className="text-sm font-medium text-gray-400 mb-3 px-1">
              {t('channels.title')}
            </h3>
            {channels.map((channel) => {
              const info = channelInfo[channel.channel_type] || {
                name: channel.channel_type,
                icon: <MessageSquare size={20} />,
                color: 'text-gray-400',
                fields: [],
              };
              const isSelected = selectedChannel === channel.id;
              const isConfigured = hasValidConfig(channel);

              return (
                <button
                  key={channel.id}
                  onClick={() => handleChannelSelect(channel.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-4 rounded-xl border transition-all',
                    isSelected
                      ? 'bg-dark-600 border-claw-500'
                      : 'bg-dark-700 border-dark-500 hover:border-dark-400'
                  )}
                >
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      isConfigured ? 'bg-dark-500' : 'bg-dark-600'
                    )}
                  >
                    <span className={info.color}>{info.icon}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p
                      className={clsx(
                        'text-sm font-medium',
                        isSelected ? 'text-white' : 'text-gray-300'
                      )}
                    >
                      {info.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {isConfigured ? (
                        <>
                          <Check size={12} className="text-green-400" />
                          <span className="text-xs text-green-400">{t('channels.configured')}</span>
                        </>
                      ) : (
                        <>
                          <X size={12} className="text-gray-500" />
                          <span className="text-xs text-gray-500">{t('channels.notConfigured')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className={isSelected ? 'text-claw-400' : 'text-gray-600'}
                  />
                </button>
              );
            })}
          </div>

          {/* 配置面板 */}
          <div className="md:col-span-2">
            {currentChannel && currentInfo ? (
              <motion.div
                key={selectedChannel}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-dark-700 rounded-2xl p-6 border border-dark-500"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center bg-dark-500', currentInfo.color)}>
                    {currentInfo.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {t('channels.configure', { name: currentInfo.name })}
                    </h3>
                    {currentInfo.helpText && (
                      <p className="text-xs text-gray-500">{currentInfo.helpText}</p>
                    )}
                  </div>
                </div>

                {/* 飞书插件状态提示 */}
                {currentChannel.channel_type === 'feishu' && (
                  <div className="mb-4">
                    {feishuPluginLoading ? (
                      <div className="p-4 bg-dark-600 rounded-xl border border-dark-500 flex items-center gap-3">
                        <Loader2 size={20} className="animate-spin text-gray-400" />
                        <span className="text-gray-400">{t('channels.feishu.checkingPlugin')}</span>
                      </div>
                    ) : feishuPluginStatus?.installed ? (
                      <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30 flex items-center gap-3">
                        <Package size={20} className="text-green-400" />
                        <div className="flex-1">
                          <p className="text-green-400 font-medium">{t('channels.feishu.pluginInstalled')}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {feishuPluginStatus.plugin_name || '@m1heng-clawd/feishu'}
                            {feishuPluginStatus.version && ` v${feishuPluginStatus.version}`}
                          </p>
                        </div>
                        <CheckCircle size={16} className="text-green-400" />
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={20} className="text-amber-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-amber-400 font-medium">{t('channels.feishu.pluginNeeded')}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {t('channels.feishu.pluginDesc')}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={handleInstallFeishuPlugin}
                                disabled={feishuPluginInstalling}
                                className="btn-primary flex items-center gap-2 text-sm py-2"
                              >
                                {feishuPluginInstalling ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Download size={14} />
                                )}
                                {feishuPluginInstalling ? t('channels.feishu.installing') : t('channels.feishu.installPlugin')}
                              </button>
                              <button
                                onClick={checkFeishuPlugin}
                                disabled={feishuPluginLoading}
                                className="btn-secondary flex items-center gap-2 text-sm py-2"
                              >
                                {t('channels.feishu.refreshStatus')}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {t('channels.feishu.manualInstall')} <code className="px-1.5 py-0.5 bg-dark-600 rounded text-gray-400">openclaw plugins install @m1heng-clawd/feishu</code>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {currentInfo.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm text-gray-400 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-1">*</span>}
                        {configForm[field.key] && (
                          <span className="ml-2 text-green-500 text-xs">✓</span>
                        )}
                      </label>

                      {field.type === 'select' ? (
                        <select
                          value={configForm[field.key] || ''}
                          onChange={(e) =>
                            setConfigForm({ ...configForm, [field.key]: e.target.value })
                          }
                          className="input-base"
                        >
                          <option value="">{t('channels.pleaseSelect')}</option>
                          {field.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'password' ? (
                        <div className="relative">
                          <input
                            type={visiblePasswords.has(field.key) ? 'text' : 'password'}
                            value={configForm[field.key] || ''}
                            onChange={(e) =>
                              setConfigForm({ ...configForm, [field.key]: e.target.value })
                            }
                            placeholder={field.placeholder}
                            className="input-base pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(field.key)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                            title={visiblePasswords.has(field.key) ? t('channels.hide') : t('channels.show')}
                          >
                            {visiblePasswords.has(field.key) ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <input
                          type={field.type}
                          value={configForm[field.key] || ''}
                          onChange={(e) =>
                            setConfigForm({ ...configForm, [field.key]: e.target.value })
                          }
                          placeholder={field.placeholder}
                          className="input-base"
                        />
                      )}
                    </div>
                  ))}

                  {/* WhatsApp 特殊处理：扫码登录按钮 */}
                  {currentChannel.channel_type === 'whatsapp' && (
                    <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                      <div className="flex items-center gap-3 mb-3">
                        <QrCode size={24} className="text-green-400" />
                        <div>
                          <p className="text-white font-medium">{t('channels.whatsapp.qrLogin')}</p>
                          <p className="text-xs text-gray-400">{t('channels.whatsapp.qrLoginDesc')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleWhatsAppLogin}
                          disabled={loginLoading}
                          className="flex-1 btn-secondary flex items-center justify-center gap-2"
                        >
                          {loginLoading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <QrCode size={16} />
                          )}
                          {loginLoading ? t('channels.whatsapp.waitingLogin') : t('channels.whatsapp.startLogin')}
                        </button>
                        <button
                          onClick={async () => {
                            await fetchChannels();
                            handleQuickTest();
                          }}
                          disabled={testing}
                          className="btn-secondary flex items-center justify-center gap-2 px-4"
                          title={t('channels.feishu.refreshStatus')}
                        >
                          {testing ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {t('channels.whatsapp.refreshHint')}
                      </p>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="pt-4 border-t border-dark-500 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn-primary flex items-center gap-2"
                    >
                      {saving ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {t('channels.saveConfig')}
                    </button>

                    {/* 快速测试按钮 */}
                    <button
                      onClick={handleQuickTest}
                      disabled={testing}
                      className="btn-secondary flex items-center gap-2"
                    >
                      {testing ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Play size={16} />
                      )}
                      {t('channels.quickTest')}
                    </button>

                    {/* 清空配置按钮 */}
                    {!showClearConfirm ? (
                      <button
                        onClick={handleShowClearConfirm}
                        disabled={clearing}
                        className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 hover:border-red-500/50"
                      >
                        {clearing ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        {t('channels.clearConfig')}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg border border-red-500/50">
                        <span className="text-sm text-red-300">{t('channels.confirmClear')}</span>
                        <button
                          onClick={handleClearConfig}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                          {t('channels.confirm')}
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className="px-2 py-1 text-xs bg-dark-600 text-gray-300 rounded hover:bg-dark-500 transition-colors"
                        >
                          {t('channels.cancel')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 测试结果显示 */}
                  {testResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={clsx(
                        'mt-4 p-4 rounded-xl flex items-start gap-3',
                        testResult.success ? 'bg-green-500/10' : 'bg-red-500/10'
                      )}
                    >
                      {testResult.success ? (
                        <CheckCircle size={20} className="text-green-400 mt-0.5" />
                      ) : (
                        <XCircle size={20} className="text-red-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className={clsx(
                          'font-medium',
                          testResult.success ? 'text-green-400' : 'text-red-400'
                        )}>
                          {testResult.success ? t('channels.testSuccess') : t('channels.testFailed')}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">{testResult.message}</p>
                        {testResult.error && (
                          <p className="text-xs text-red-300 mt-2 whitespace-pre-wrap">
                            {testResult.error}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <p>{t('channels.selectChannel')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
