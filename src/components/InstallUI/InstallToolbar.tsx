import { ReactNode } from 'react';

interface InstallToolbarProps {
  title: string;
  children: ReactNode;
}

export function InstallToolbar({ title, children }: InstallToolbarProps) {
  return (
    <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
      <h4 className="text-white font-medium mb-3">{title}</h4>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

