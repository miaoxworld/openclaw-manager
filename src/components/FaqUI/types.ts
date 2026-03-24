export type FaqCategory =
  | 'prerequisites'
  | 'install-options'
  | 'post-install'
  | 'lifecycle'
  | 'troubleshooting';

export interface FaqCommand {
  label: string;
  command: string;
}

export interface FaqAction {
  label: string;
  target: 'install' | 'routes';
}

export interface FaqEntry {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  keywords: string[];
  commands?: FaqCommand[];
  actions?: FaqAction[];
  severity?: 'info' | 'warning';
}

export interface FaqDocMeta {
  title: string;
  updatedAt: string | null;
  sourceLabel: string;
  error?: string | null;
  rawContent?: string;
}
