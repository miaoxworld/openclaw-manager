import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface StatusChip {
  label: string;
  value: string;
  className?: string;
}

interface StatusHeaderCardProps {
  title: string;
  description: string;
  chips: StatusChip[];
  onRefresh: () => void;
  refreshing?: boolean;
}

export function StatusHeaderCard({
  title,
  description,
  chips,
  onRefresh,
  refreshing = false,
}: StatusHeaderCardProps) {
  return (
    <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className={clsx('px-3 py-1 rounded-full text-xs', chip.className || 'text-gray-200 bg-dark-600')}
              >
                {chip.label}: {chip.value}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          刷新状态
        </button>
      </div>
    </div>
  );
}

