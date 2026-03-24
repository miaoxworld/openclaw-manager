import { Construction, Rocket } from 'lucide-react';

interface ModulePlaceholderProps {
  title: string;
  description: string;
}

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-4xl space-y-6">
        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Construction size={22} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl text-white font-semibold">{title}</h3>
              <p className="text-sm text-gray-400 mt-1">{description}</p>
              <p className="text-sm text-gray-300 mt-4">
                当前模块还未接入业务功能，后续会补充安装向导、配置管理与诊断工具。
              </p>
            </div>
          </div>
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-center gap-3 mb-3">
            <Rocket size={18} className="text-claw-300" />
            <h4 className="text-white font-medium">后续规划</h4>
          </div>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• CLI 检测与版本展示</li>
            <li>• 安装与初始化引导</li>
            <li>• 模块专属配置与测试入口</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
