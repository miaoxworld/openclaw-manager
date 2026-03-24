import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import clsx from 'clsx';
import { DEFAULT_EXPANDED_SECTIONS, FAQ_CATEGORIES } from './faqData';
import { FaqSection } from './FaqSection';
import { FaqCategory, FaqDocMeta, FaqEntry } from './types';

interface FaqPageShellProps {
  entries: FaqEntry[];
  docsMeta: FaqDocMeta;
  loadingDocs: boolean;
  onNavigate: (target: 'install' | 'routes') => void;
}

function buildSearchText(entry: FaqEntry): string {
  const commandText = entry.commands?.map((item) => item.command).join(' ') || '';
  return [entry.question, entry.answer, entry.keywords.join(' '), commandText].join(' ').toLowerCase();
}

export function FaqPageShell({ entries, docsMeta, loadingDocs, onNavigate }: FaqPageShellProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<FaqCategory, boolean>>({
    prerequisites: DEFAULT_EXPANDED_SECTIONS.includes('prerequisites'),
    'install-options': DEFAULT_EXPANDED_SECTIONS.includes('install-options'),
    'post-install': DEFAULT_EXPANDED_SECTIONS.includes('post-install'),
    lifecycle: DEFAULT_EXPANDED_SECTIONS.includes('lifecycle'),
    troubleshooting: DEFAULT_EXPANDED_SECTIONS.includes('troubleshooting'),
  });

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return entries;
    }

    return entries.filter((entry) => buildSearchText(entry).includes(normalizedQuery));
  }, [entries, query]);

  const grouped = useMemo(() => {
    const buckets: Record<FaqCategory, FaqEntry[]> = {
      prerequisites: [],
      'install-options': [],
      'post-install': [],
      lifecycle: [],
      troubleshooting: [],
    };

    filteredEntries.forEach((entry) => {
      buckets[entry.category].push(entry);
    });

    return buckets;
  }, [filteredEntries]);

  const total = filteredEntries.length;

  const jumpToCategory = (category: FaqCategory) => {
    setExpanded((prev) => ({ ...prev, [category]: true }));
    const element = document.getElementById(`faq-${category}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500 space-y-4">
        <div className="faq-search-wrap">
          <Search size={14} className="text-gray-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索问题、关键词、命令..."
            className="faq-search-input"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="faq-chip-row">
            {FAQ_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => jumpToCategory(category.id)}
                className={clsx(
                  'faq-category-chip',
                  grouped[category.id].length > 0 && 'has-items'
                )}
              >
                {category.label}
                <span className="faq-chip-count">{grouped[category.id].length}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">匹配条目: {total}</p>
        </div>
      </div>

      <div className="rounded-xl border border-dark-500 bg-dark-700/80 px-4 py-3 text-xs text-gray-300">
        <p>
          文档: {docsMeta.title}
          {' · '}
          文档来源: {docsMeta.sourceLabel}
          {' · '}
          更新时间: {docsMeta.updatedAt || '--'}
        </p>
        {docsMeta.error && (
          <p className="mt-2 text-yellow-300 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {docsMeta.error}
          </p>
        )}
      </div>

      {FAQ_CATEGORIES.map((category) => {
        const categoryEntries = grouped[category.id];
        if (categoryEntries.length === 0) {
          return null;
        }

        return (
          <FaqSection
            key={category.id}
            sectionId={`faq-${category.id}`}
            title={category.label}
            entries={categoryEntries}
            expanded={expanded[category.id]}
            onToggle={() =>
              setExpanded((prev) => ({
                ...prev,
                [category.id]: !prev[category.id],
              }))
            }
            onNavigate={onNavigate}
          />
        );
      })}

      <details className="faq-raw-docs">
        <summary>查看原文（追溯）</summary>
        <div className="mt-3">
          {loadingDocs ? (
            <p className="text-sm text-gray-400">正在加载原文...</p>
          ) : (
            <pre className="faq-raw-pre">{docsMeta.rawContent || '暂无原文内容'}</pre>
          )}
        </div>
      </details>
    </div>
  );
}
