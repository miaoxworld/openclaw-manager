import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { FaqCommand } from './types';

interface CommandBlockProps {
  command: FaqCommand;
}

export function CommandBlock({ command }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="faq-command-block">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-400 inline-flex items-center gap-1.5">
          <Terminal size={12} />
          {command.label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="faq-copy-btn"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="faq-command-pre">{command.command}</pre>
    </div>
  );
}
