import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { FaqItem } from './FaqItem';
import { FaqEntry } from './types';

interface FaqSectionProps {
  sectionId: string;
  title: string;
  entries: FaqEntry[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (target: 'install' | 'routes') => void;
}

export function FaqSection({
  sectionId,
  title,
  entries,
  expanded,
  onToggle,
  onNavigate,
}: FaqSectionProps) {
  return (
    <section id={sectionId} className="faq-section-card">
      <button type="button" className="faq-section-header" onClick={onToggle}>
        <div>
          <h4 className="text-white font-medium text-sm">{title}</h4>
          <p className="text-xs text-gray-400 mt-1">{entries.length} 条</p>
        </div>
        <ChevronDown
          size={16}
          className={clsx('text-gray-400 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {entries.map((entry) => (
            <FaqItem key={entry.id} item={entry} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </section>
  );
}
