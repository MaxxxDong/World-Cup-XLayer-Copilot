import type { UserSettings } from "../shared/types";
import {
  normalizeLLMProvider,
  normalizeTranscriptionProvider
} from "../shared/provider-presets";
import { cacheDocumentTheme, normalizeThemeMode } from "../shared/theme";

const SETTINGS_KEY = "worldCupCopilotSettings";

export const defaultSettings: UserSettings = {
  language: "en",
  theme: "white",
  llm: {
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    apiKey: "",
    model: "",
    visionModel: "",
    providerProfiles: {}
  },
  sports: {
    apiFootballKey: "",
    footballDataKey: ""
  },
  replay: {
    enabled: true,
    windowSeconds: 60,
    mode: "video-audio",
    uploadFramesToAI: false,
    uploadAudioToASR: false
  },
  transcription: {
    enabled: true,
    provider: "openai-transcribe",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    apiKey: "",
    model: "gpt-4o-mini-transcribe",
    maxSeconds: 10,
    providerProfiles: {}
  },
  dataPackage: {
    manifestUrl: "https://raw.githubusercontent.com/MaxxxDong/world-cup-copilot-data/main/manifest.json",
    autoCheck: true,
    selectedTiers: ["core"]
  }
};

export async function loadSettings(): Promise<UserSettings> {
  const stored = await readStorage<UserSettings>(SETTINGS_KEY);
  const settings = mergeSettings(stored);
  cacheDocumentTheme(settings.theme);
  return settings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  cacheDocumentTheme(settings.theme);
  await writeStorage(SETTINGS_KEY, settings);
}

export function watchSettings(onChange: (settings: UserSettings) => void): () => void {
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
      const settings = mergeSettings(changes[SETTINGS_KEY].newValue as Partial<UserSettings> | undefined);
      cacheDocumentTheme(settings.theme);
      onChange(settings);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  return () => undefined;
}

export function hasLLMSettings(settings: UserSettings): boolean {
  return Boolean(settings.llm.baseURL && settings.llm.apiKey && settings.llm.model);
}

function mergeSettings(stored?: Partial<UserSettings>): UserSettings {
  const llmProvider = normalizeLLMProvider(stored?.llm?.provider);
  const llmProfiles: NonNullable<UserSettings["llm"]["providerProfiles"]> = {
    ...(stored?.llm?.providerProfiles ?? {})
  };
  if (stored?.llm) {
    const profile = llmProfiles[llmProvider];
    llmProfiles[llmProvider] = {
      baseURL: stored.llm.baseURL ?? profile?.baseURL ?? defaultSettings.llm.baseURL,
      apiKey: stored.llm.apiKey ?? profile?.apiKey ?? "",
      model: stored.llm.model ?? profile?.model ?? defaultSettings.llm.model,
      visionModel: stored.llm.visionModel ?? profile?.visionModel ?? defaultSettings.llm.visionModel
    };
  }

  const transcriptionProvider = normalizeTranscriptionProvider(stored?.transcription?.provider);
  const transcriptionProfiles: NonNullable<UserSettings["transcription"]["providerProfiles"]> = {
    ...(stored?.transcription?.providerProfiles ?? {})
  };
  if (stored?.transcription) {
    const profile = transcriptionProfiles[transcriptionProvider];
    transcriptionProfiles[transcriptionProvider] = {
      endpoint: stored.transcription.endpoint ?? profile?.endpoint ?? defaultSettings.transcription.endpoint,
      apiKey: stored.transcription.apiKey ?? profile?.apiKey ?? "",
      model: stored.transcription.model ?? profile?.model ?? defaultSettings.transcription.model,
      maxSeconds: stored.transcription.maxSeconds ?? profile?.maxSeconds ?? defaultSettings.transcription.maxSeconds
    };
  }

  return {
    language: stored?.language ?? defaultSettings.language,
    theme: normalizeThemeMode(stored?.theme),
    llm: {
      ...defaultSettings.llm,
      ...(stored?.llm ?? {}),
      provider: llmProvider,
      providerProfiles: llmProfiles
    },
    sports: {
      ...defaultSettings.sports,
      ...(stored?.sports ?? {})
    },
    replay: {
      ...defaultSettings.replay,
      ...(stored?.replay ?? {}),
      enabled: true
    },
    transcription: {
      ...defaultSettings.transcription,
      ...(stored?.transcription ?? {}),
      enabled: true,
      provider: transcriptionProvider,
      providerProfiles: transcriptionProfiles
    },
    dataPackage: {
      ...defaultSettings.dataPackage,
      ...(stored?.dataPackage ?? {})
    }
  };
}

async function readStorage<T>(key: string): Promise<T | undefined> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  const raw = globalThis.localStorage?.getItem(key);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function writeStorage<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}
