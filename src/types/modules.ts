export type ModuleType = 'openclaw' | 'codex' | 'claudecode';

export type ModuleHealth = 'installed' | 'not_installed';

export interface ModuleAction {
  id: string;
  label: string;
  description: string;
  command?: string;
  externalUrl?: string;
}

export interface ModuleDefinition {
  id: ModuleType;
  name: string;
  description: string;
  capabilities: string[];
  prerequisites: string[];
  installCommands: string[];
  verifyCommands: string[];
  docs: { label: string; url: string }[];
  faqs: { question: string; answer: string }[];
  actions: ModuleAction[];
}

export interface ModuleRuntimeStatus {
  module_id: ModuleType;
  installed: boolean;
  version: string | null;
  message: string;
}
