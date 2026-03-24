import { AlertTriangle, ArrowRight } from 'lucide-react';
import { CommandBlock } from './CommandBlock';
import { FaqEntry } from './types';

interface FaqItemProps {
  item: FaqEntry;
  onNavigate: (target: 'install' | 'routes') => void;
}

export function FaqItem({ item, onNavigate }: FaqItemProps) {
  return (
    <article className="faq-item-card">
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-white text-sm font-medium">{item.question}</h5>
        {item.severity === 'warning' && (
          <span className="faq-warning-chip">
            <AlertTriangle size={12} />
            注意
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-300 leading-relaxed">{item.answer}</p>

      {item.commands && item.commands.length > 0 && (
        <div className="mt-3 space-y-2">
          {item.commands.map((command) => (
            <CommandBlock key={`${item.id}-${command.label}`} command={command} />
          ))}
        </div>
      )}

      {item.actions && item.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.actions.map((action) => (
            <button
              key={`${item.id}-${action.target}`}
              type="button"
              className="faq-action-btn"
              onClick={() => onNavigate(action.target)}
            >
              {action.label}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
