import { ReactNode } from 'react';
import { Terminal, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface InstallActionCardProps {
  title: string;
  description: string;
  onAction: () => void;
  actionLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  helperText?: string;
  children?: ReactNode;
}

export function InstallActionCard({
  title,
  description,
  onAction,
  actionLabel = '立即执行',
  disabled = false,
  loading = false,
  helperText,
  children,
}: InstallActionCardProps) {
  return (
    <div className="install-card">
      <button onClick={onAction} disabled={disabled} className="group w-full text-left disabled:opacity-50">
        <p className="font-medium text-white mb-1">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
        {helperText && <p className="text-xs text-gray-400 mt-2">{helperText}</p>}
        <span className="install-action-btn mt-3 inline-flex items-center gap-1.5">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Terminal size={12} />}
          {actionLabel}
        </span>
      </button>
      {children && <div className={clsx('mt-3 space-y-2')}>{children}</div>}
    </div>
  );
}

