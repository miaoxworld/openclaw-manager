import { useEffect, useMemo, useState } from 'react';
import { api, TuziConfigOverview, TuziGroup, TuziModelsSource } from '../lib/tauri';

export interface TuziDisplayModel {
  id: string;
  unavailable: boolean;
  selected: boolean;
}

function dedupeModels(models: string[]): string[] {
  const normalized: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || normalized.includes(trimmed)) continue;
    normalized.push(trimmed);
  }
  return normalized;
}

function getConfiguredModels(tuziConfig: TuziConfigOverview | null, group: TuziGroup): string[] {
  const models = tuziConfig?.groups.find((item) => item.group === group)?.models || [];
  if (group !== 'gaccode') {
    return models;
  }
  return dedupeModels(models.map((model) => model.includes('/') ? model.split('/').slice(1).join('/') : model));
}

const FIXED_GROUP_MODELS: Partial<Record<TuziGroup, string[]>> = {
  gaccode: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'gpt-5.4',
  ],
};

export function isFixedTuziGroup(group: TuziGroup): boolean {
  return group in FIXED_GROUP_MODELS;
}

export function getFixedTuziModels(group: TuziGroup): string[] {
  return FIXED_GROUP_MODELS[group]?.slice() || [];
}

function getInitialModels(group: TuziGroup, tuziConfig: TuziConfigOverview | null): string[] {
  const configured = getConfiguredModels(tuziConfig, group);
  if (configured.length > 0) {
    return configured;
  }
  return getFixedTuziModels(group);
}

export function useTuziModelSelection(group: TuziGroup, tuziConfig: TuziConfigOverview | null) {
  const [apiKey, setApiKey] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualEntryEnabled, setManualEntryEnabled] = useState(false);
  const [modelsSource, setModelsSource] = useState<TuziModelsSource | null>(null);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setApiKey('');
    setCustomModel('');
    setAvailableModels([]);
    setFetchingModels(false);
    setFetchError(null);
    setManualEntryEnabled(false);
    setModelsSource(null);
    setCacheTimestamp(null);
    setWarning(null);
    setSelectedModels(getInitialModels(group, tuziConfig));
  }, [group, tuziConfig]);

  const configuredModels = useMemo(() => getConfiguredModels(tuziConfig, group), [group, tuziConfig]);
  const fixedModels = useMemo(() => getFixedTuziModels(group), [group]);
  const fixedGroup = isFixedTuziGroup(group);

  const displayModels = useMemo<TuziDisplayModel[]>(() => {
    const merged = dedupeModels([...fixedModels, ...availableModels, ...configuredModels, ...selectedModels]);
    return merged.map((id) => ({
      id,
      unavailable: !fixedGroup && availableModels.length > 0 && !availableModels.includes(id),
      selected: selectedModels.includes(id),
    }));
  }, [availableModels, configuredModels, fixedGroup, fixedModels, selectedModels]);

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((item) => item !== modelId)
        : [...prev, modelId]
    );
  };

  const addCustomModel = () => {
    const trimmed = customModel.trim();
    if (!trimmed) {
      setFetchError('请输入模型名称');
      return;
    }
    setSelectedModels((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setAvailableModels((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomModel('');
    setFetchError(null);
  };

  const fetchModels = async () => {
    if (fixedGroup) {
      const fetched = dedupeModels(fixedModels);
      setAvailableModels(fetched);
      setSelectedModels((prev) => {
        const normalizedPrev = dedupeModels(prev);
        return normalizedPrev.length === 0 ? fetched : normalizedPrev;
      });
      setFetchError(null);
      setManualEntryEnabled(false);
      setModelsSource('api');
      setCacheTimestamp(null);
      setWarning(null);
      return true;
    }

    if (!apiKey.trim()) {
      setFetchError('请输入 Tuzi API Key');
      return false;
    }

    setFetchingModels(true);
    setFetchError(null);
    setManualEntryEnabled(false);
    setWarning(null);
    setCacheTimestamp(null);
    try {
      const result = await api.fetchTuziModels(group, apiKey.trim());
      const fetched = dedupeModels(result.models);
      setAvailableModels(fetched);
      setModelsSource(result.source);
      setCacheTimestamp(result.cache_timestamp);
      setWarning(result.warning);
      setSelectedModels((prev) => {
        const normalizedPrev = dedupeModels(prev);
        if (normalizedPrev.length === 0) {
          return fetched[0] ? [fetched[0]] : [];
        }
        return normalizedPrev;
      });
      return true;
    } catch (error) {
      setFetchError(String(error));
      setModelsSource(null);
      setWarning(null);
      setCacheTimestamp(null);
      setManualEntryEnabled(true);
      setAvailableModels([]);
      return false;
    } finally {
      setFetchingModels(false);
    }
  };

  return {
    apiKey,
    setApiKey,
    selectedModels,
    setSelectedModels,
    customModel,
    setCustomModel,
    availableModels,
    displayModels,
    fetchingModels,
    fetchError,
    manualEntryEnabled,
    fixedGroup,
    modelsSource,
    cacheTimestamp,
    warning,
    toggleModel,
    addCustomModel,
    fetchModels,
  };
}
