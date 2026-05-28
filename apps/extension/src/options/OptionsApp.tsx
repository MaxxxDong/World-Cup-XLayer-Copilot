import { useEffect, useRef, useState } from "react";
import { testSites } from "../data/test-sites";
import { t } from "../i18n/messages";
import {
  checkDataPackageManifest,
  ensureCoreDataPackage,
  pullDataPackage,
  type PullDataPackageProgress,
  summarizeDataPackageManifest
} from "../services/data-package";
import { IndexedDbDataPackageStore } from "../services/data-store";
import { testLLMConnection, type LLMConnectionTestResult } from "../services/llm";
import { defaultSettings, loadSettings, saveSettings } from "../services/settings";
import {
  testTranscriptionConnection,
  type TranscriptionConnectionTestResult
} from "../services/transcription";
import {
  getLLMProviderOption,
  getTranscriptionProviderOption,
  LLM_PROVIDER_OPTIONS,
  TRANSCRIPTION_PROVIDER_OPTIONS
} from "../shared/provider-presets";
import {
  runSportsDiagnostics,
  type SportsDiagnosticsResult
} from "../services/sports-diagnostics";
import { applyDocumentTheme, getInitialDocumentTheme } from "../shared/theme";
import type {
  DataPackageDownloadTier,
  DataPackageManifestSummary,
  DataPackageVersionState,
  Language,
  ThemeMode,
  UserSettings
} from "../shared/types";

const dataStore = new IndexedDbDataPackageStore();
const DATA_PACKAGE_TIERS: Array<{
  value: DataPackageDownloadTier;
  label: Record<Language, string>;
  description: Record<Language, string>;
}> = [
  {
    value: "core",
    label: { en: "Core", zh: "核心数据" },
    description: {
      en: "Required schedule, taxonomy, sources, and market hints.",
      zh: "必需的赛程、分类、来源和市场提示。"
    }
  },
  {
    value: "match-context",
    label: { en: "Match context", zh: "比赛上下文" },
    description: {
      en: "Head-to-head, form, and match-level history.",
      zh: "交锋记录、近期状态和比赛级历史。"
    }
  },
  {
    value: "player-context",
    label: { en: "Player context", zh: "球员上下文" },
    description: {
      en: "Goalscorer indexes and player identity shards.",
      zh: "射手索引和球员身份分片。"
    }
  },
  {
    value: "tournament-context",
    label: { en: "Tournament context", zh: "赛事上下文" },
    description: { en: "Optional tournament-wide files when present.", zh: "可选的世界杯全局数据文件。" }
  },
  {
    value: "audit",
    label: { en: "Audit", zh: "审计文件" },
    description: {
      en: "Checksums and reproducibility files; not needed at runtime.",
      zh: "校验和与可复现文件，运行时不需要。"
    }
  },
  {
    value: "optional",
    label: { en: "Optional", zh: "可选数据" },
    description: {
      en: "Future non-critical files outside the standard runtime tiers.",
      zh: "标准运行层之外的未来非关键文件。"
    }
  }
];

type TranscriptionProviderHelp = {
  description: string;
  links: Array<{ label: string; href: string }>;
};

type LLMProviderHelp = TranscriptionProviderHelp;

export default function OptionsApp() {
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...defaultSettings,
    theme: getInitialDocumentTheme()
  }));
  const [saved, setSaved] = useState(false);
  const [llmProviderMessage, setLlmProviderMessage] = useState<string>();
  const [transcriptionProviderMessage, setTranscriptionProviderMessage] = useState<string>();
  const [textModelTest, setTextModelTest] = useState<LLMConnectionTestResult>();
  const [visionModelTest, setVisionModelTest] = useState<LLMConnectionTestResult>();
  const [transcriptionTest, setTranscriptionTest] = useState<TranscriptionConnectionTestResult>();
  const [testingTextModel, setTestingTextModel] = useState(false);
  const [testingVisionModel, setTestingVisionModel] = useState(false);
  const [testingTranscription, setTestingTranscription] = useState(false);
  const [sportsDiagnostics, setSportsDiagnostics] = useState<SportsDiagnosticsResult>();
  const [testingSports, setTestingSports] = useState(false);
  const [dataState, setDataState] = useState<DataPackageVersionState>({});
  const [dataSummary, setDataSummary] = useState<DataPackageManifestSummary>();
  const [checkedDataSummary, setCheckedDataSummary] = useState<DataPackageManifestSummary>();
  const [sourceSummary, setSourceSummary] = useState<string[]>([]);
  const [dataMessage, setDataMessage] = useState<string>();
  const [pullingData, setPullingData] = useState(false);
  const [checkingData, setCheckingData] = useState(false);
  const loadedRef = useRef(false);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const lang = settings.language;

  useEffect(() => {
    loadSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      loadedRef.current = true;
    });
    refreshDataPackageState();
  }, []);

  useEffect(() => applyDocumentTheme(settings.theme), [settings.theme]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    setSaved(false);
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveSettings(settings).then(() => setSaved(true));
    }, 500);
    return () => {
      if (autosaveTimerRef.current !== undefined) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [settings]);

  function patch(next: Partial<UserSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function commitSettings(next: UserSettings) {
    setSettings(next);
    setSaved(false);
    void saveSettings(next).then(() => setSaved(true));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await saveSettings(settings);
    setSaved(true);
  }

  async function testTextModel() {
    setTestingTextModel(true);
    setTextModelTest(undefined);
    const result = await testLLMConnection(settings, { mode: "text" });
    setTextModelTest(result);
    setTestingTextModel(false);
  }

  async function testVisionModel() {
    setTestingVisionModel(true);
    setVisionModelTest(undefined);
    const result = await testLLMConnection(settings, { mode: "vision", prompt: "hi" });
    setVisionModelTest(result);
    setTestingVisionModel(false);
  }

  async function testTranscription() {
    setTestingTranscription(true);
    setTranscriptionTest(undefined);
    const result = await testTranscriptionConnection(settings);
    setTranscriptionTest(result);
    setTestingTranscription(false);
  }

  async function testSportsApis() {
    setTestingSports(true);
    setSportsDiagnostics(undefined);
    const result = await runSportsDiagnostics(settings);
    setSportsDiagnostics(result);
    setTestingSports(false);
  }

  async function refreshDataPackageState() {
    const state = await dataStore.readVersionState();
    setDataState(state);
    if (!state.activeDataVersion) {
      setDataSummary(undefined);
      setSourceSummary([]);
      return;
    }
    const manifest = await dataStore.readManifest(state.activeDataVersion);
    setDataSummary(manifest ? summarizeDataPackageManifest(manifest) : undefined);
    const sourcesContent = await dataStore.readFile(state.activeDataVersion, "data/sources/sources.json");
    setSourceSummary(formatSourceSummary(sourcesContent));
  }

  async function checkManifestOnly() {
    setCheckingData(true);
    setDataMessage(undefined);
    try {
      const result = await checkDataPackageManifest({
        manifestUrl: settings.dataPackage.manifestUrl,
        store: dataStore
      });
      setCheckedDataSummary(result.summary);
      setDataMessage(
        lang === "zh"
          ? `Manifest 正常：${result.summary.dataVersion}，${result.summary.fileCount} 个文件，${result.summary.totalBytes} bytes。`
          : `Manifest OK: ${result.summary.dataVersion}, ${result.summary.fileCount} files, ${result.summary.totalBytes} bytes.`
      );
      await refreshDataPackageState();
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCheckingData(false);
    }
  }

  async function pullSelectedDataPackage() {
    const selectedTiers = normalizedSelectedTiers(settings.dataPackage.selectedTiers);
    if (selectedTiers.some(isBulkDataPackageTier) && !window.confirm(t(lang, "dataSelectedTierLargeWarning"))) {
      return;
    }
    setPullingData(true);
    setDataMessage(t(lang, "dataExpandingSelectedTiers"));
    try {
      const result = await pullDataPackage({
        manifestUrl: settings.dataPackage.manifestUrl,
        tiers: selectedTiers,
        store: dataStore,
        onProgress: (progress) => setDataMessage(formatDataPullProgress(progress, lang))
      });
      setDataMessage(
        lang === "zh"
          ? `已拉取 ${result.downloadedFiles} 个文件（${result.totalBytes} bytes）。`
          : `Pulled ${result.downloadedFiles} files (${result.totalBytes} bytes).`
      );
      setCheckedDataSummary(undefined);
      await refreshDataPackageState();
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPullingData(false);
    }
  }

  async function pullRuntimeCorePackage() {
    setPullingData(true);
    setDataMessage(undefined);
    try {
      const result = await ensureCoreDataPackage({
        manifestUrl: settings.dataPackage.manifestUrl,
        store: dataStore
      });
      setDataMessage(
        result.downloadedFiles
          ? lang === "zh"
            ? `已拉取最新运行核心数据：${result.downloadedFiles} 个文件（${result.totalBytes} bytes）。`
            : `Pulled latest runtime core: ${result.downloadedFiles} files (${result.totalBytes} bytes).`
          : lang === "zh"
            ? `运行核心数据已缓存：${result.dataVersion}。`
            : `Runtime core is already cached for ${result.dataVersion}.`
      );
      setCheckedDataSummary(undefined);
      await refreshDataPackageState();
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPullingData(false);
    }
  }

  async function rollbackDataPackage() {
    await dataStore.rollback();
    await refreshDataPackageState();
  }

  async function resetDataPackage() {
    await dataStore.resetToBundledSnapshot();
    setDataMessage(
      lang === "zh"
        ? "已恢复到内置初始数据。远端数据包仍会保留，可用于回滚。"
        : "Reset to bundled seed. Remote package remains stored for rollback."
    );
    await refreshDataPackageState();
  }

  function toggleDataTier(tier: DataPackageDownloadTier, checked: boolean) {
    const tiers = normalizedSelectedTiers(settings.dataPackage.selectedTiers);
    const next = checked ? [...new Set([...tiers, tier])] : tiers.filter((value) => value !== tier);
    patch({
      dataPackage: {
        ...settings.dataPackage,
        selectedTiers: normalizedSelectedTiers(next)
      }
    });
  }

  function selectLLMProvider(provider: UserSettings["llm"]["provider"]) {
    const option = getLLMProviderOption(provider);
    const providerProfiles: NonNullable<UserSettings["llm"]["providerProfiles"]> = {
      ...(settings.llm.providerProfiles ?? {}),
      [settings.llm.provider]: {
        baseURL: settings.llm.baseURL,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
        visionModel: settings.llm.visionModel ?? ""
      }
    };
    const cached = providerProfiles[provider];
    const nextSettings: UserSettings = {
      ...settings,
      llm: cached
        ? {
            ...settings.llm,
            provider,
            baseURL: cached.baseURL,
            apiKey: cached.apiKey,
            model: cached.model,
            visionModel: cached.visionModel ?? "",
            providerProfiles
          }
        : {
            ...settings.llm,
            provider,
            apiKey: "",
            baseURL: option.baseURL,
            model: option.model,
            visionModel: option.visionModel,
            providerProfiles
          }
    };
    setTextModelTest(undefined);
    setVisionModelTest(undefined);
    setLlmProviderMessage(formatProviderSwitchMessage(lang, option.label));
    commitSettings(nextSettings);
  }

  function selectTranscriptionProvider(provider: UserSettings["transcription"]["provider"]) {
    const option = getTranscriptionProviderOption(provider);
    const providerProfiles: NonNullable<UserSettings["transcription"]["providerProfiles"]> = {
      ...(settings.transcription.providerProfiles ?? {}),
      [settings.transcription.provider]: {
        endpoint: settings.transcription.endpoint,
        apiKey: settings.transcription.apiKey,
        model: settings.transcription.model,
        maxSeconds: settings.transcription.maxSeconds
      }
    };
    const cached = providerProfiles[provider];
    const nextSettings: UserSettings = {
      ...settings,
      transcription: cached
        ? {
            ...settings.transcription,
            enabled: true,
            provider,
            endpoint: cached.endpoint,
            apiKey: cached.apiKey,
            model: cached.model,
            maxSeconds: cached.maxSeconds ?? settings.transcription.maxSeconds,
            providerProfiles
          }
        : {
            ...settings.transcription,
            enabled: true,
            provider,
            apiKey: "",
            endpoint: option.endpoint,
            model: option.model,
            providerProfiles
          }
    };
    setTranscriptionTest(undefined);
    setTranscriptionProviderMessage(formatProviderSwitchMessage(lang, option.label));
    commitSettings(nextSettings);
  }

  return (
    <main className="options-shell" data-theme={settings.theme}>
      <header>
        <h1>{t(lang, "settings")}</h1>
        <p>Keys stay in local extension storage. Wallet credentials, private keys, and seed phrases are never stored.</p>
      </header>

      <form onSubmit={submit}>
        <section>
          <h2>{t(lang, "language")}</h2>
          <label>
            UI language
            <select
              value={settings.language}
              onChange={(event) => patch({ language: event.target.value as Language })}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <label>
            {t(lang, "theme")}
            <select
              value={settings.theme}
              onChange={(event) => patch({ theme: event.target.value as ThemeMode })}
            >
              <option value="white">{t(lang, "themeWhite")}</option>
              <option value="yellow">{t(lang, "themeYellow")}</option>
              <option value="black">{t(lang, "themeBlack")}</option>
            </select>
          </label>
        </section>

        <section>
          <h2>{t(lang, "llmSettings")}</h2>
          <LLMProviderHelpBlock provider={settings.llm.provider} lang={lang} />
          <label>
            Provider preset
            <select
              value={settings.llm.provider}
              onChange={(event) => selectLLMProvider(event.target.value as UserSettings["llm"]["provider"])}
            >
              {LLM_PROVIDER_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {llmProviderMessage ? <p className="muted">{llmProviderMessage}</p> : null}
          <label>
            Base URL
            <input
              value={settings.llm.baseURL}
              onChange={(event) =>
                patch({ llm: { ...settings.llm, baseURL: event.target.value } })
              }
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={settings.llm.apiKey}
              onChange={(event) =>
                patch({ llm: { ...settings.llm, apiKey: event.target.value } })
              }
            />
          </label>
          <label>
            Model
            <input
              placeholder="gpt-4.1-mini or compatible model"
              value={settings.llm.model}
              onChange={(event) => patch({ llm: { ...settings.llm, model: event.target.value } })}
            />
          </label>
          <label>
            Vision model
            <input
              value={settings.llm.visionModel ?? ""}
              onChange={(event) =>
                patch({ llm: { ...settings.llm, visionModel: event.target.value } })
              }
            />
          </label>
          <button className="secondary" type="button" disabled={testingTextModel} onClick={testTextModel}>
            {testingTextModel ? t(lang, "testing") : t(lang, "testTextModel")}
          </button>
          <button className="secondary" type="button" disabled={testingVisionModel} onClick={testVisionModel}>
            {testingVisionModel ? t(lang, "testing") : t(lang, "testVisionModel")}
          </button>
          <ConnectionTestResult result={textModelTest} lang={lang} />
          <ConnectionTestResult result={visionModelTest} lang={lang} />
        </section>

        <section>
          <h2>{t(lang, "transcriptionSettings")}</h2>
          <p>{t(lang, "transcriptionDescription")}</p>
          <TranscriptionProviderHelpBlock provider={settings.transcription.provider} lang={lang} />
          <label>
            {t(lang, "transcriptionProvider")}
            <select
              value={settings.transcription.provider}
              onChange={(event) => selectTranscriptionProvider(event.target.value as UserSettings["transcription"]["provider"])}
            >
              {TRANSCRIPTION_PROVIDER_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {transcriptionProviderMessage ? <p className="muted">{transcriptionProviderMessage}</p> : null}
          <label>
            {t(lang, "transcriptionEndpoint")}
            <input
              placeholder="https://your-asr-endpoint.example/v1/audio/transcriptions"
              value={settings.transcription.endpoint}
              onChange={(event) =>
                patch({
                  transcription: {
                    ...settings.transcription,
                    endpoint: event.target.value
                  }
                })
              }
            />
          </label>
          <label>
            {t(lang, "transcriptionApiKey")}
            <input
              type="password"
              value={settings.transcription.apiKey}
              onChange={(event) =>
                patch({
                  transcription: {
                    ...settings.transcription,
                    apiKey: event.target.value
                  }
                })
              }
            />
          </label>
          <label>
            {t(lang, "transcriptionModel")}
            <input
              value={settings.transcription.model}
              onChange={(event) =>
                patch({
                  transcription: {
                    ...settings.transcription,
                    model: event.target.value
                  }
                })
              }
            />
          </label>
          <label>
            {t(lang, "transcriptionWindow")}
            <select
              value={settings.transcription.maxSeconds}
              onChange={(event) =>
                patch({
                  transcription: {
                    ...settings.transcription,
                    maxSeconds: Number(event.target.value) as UserSettings["transcription"]["maxSeconds"]
                  }
                })
              }
            >
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </label>
          <button className="secondary" type="button" disabled={testingTranscription} onClick={testTranscription}>
            {testingTranscription ? t(lang, "testing") : t(lang, "testTranscription")}
          </button>
          <ConnectionTestResult result={transcriptionTest} lang={lang} />
        </section>

        <section>
          <h2>{t(lang, "testSites")}</h2>
          <div className="test-site-list">
            {testSites.map((site) => (
              <a href={site.url} key={site.id} target="_blank" rel="noreferrer">
                <span>{site.label}</span>
                <small>{site.expectedMatch}</small>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h2>{t(lang, "sportsSettings")}</h2>
          <p>
            Apply for free keys directly:
            <a href="https://www.api-football.com/" target="_blank" rel="noreferrer">
              API-Football
            </a>
            <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">
              football-data.org
            </a>
          </p>
          <label>
            API-Football key
            <input
              value={settings.sports.apiFootballKey ?? ""}
              onChange={(event) =>
                patch({ sports: { ...settings.sports, apiFootballKey: event.target.value } })
              }
            />
          </label>
          <label>
            football-data.org key
            <input
              value={settings.sports.footballDataKey ?? ""}
              onChange={(event) =>
                patch({ sports: { ...settings.sports, footballDataKey: event.target.value } })
              }
            />
          </label>
          <div className="diagnostics-panel">
            <div>
              <h3>{t(lang, "sportsDiagnostics")}</h3>
              <p>{t(lang, "diagnosticsDescription")}</p>
            </div>
            <button
              className="secondary"
              type="button"
              disabled={
                testingSports ||
                (!settings.sports.apiFootballKey?.trim() &&
                  !settings.sports.footballDataKey?.trim())
              }
              onClick={testSportsApis}
            >
              {testingSports ? t(lang, "diagnosticsRunning") : t(lang, "runDiagnostics")}
            </button>
            {!settings.sports.apiFootballKey?.trim() &&
            !settings.sports.footballDataKey?.trim() ? (
              <p className="muted">{t(lang, "diagnosticsNoKeys")}</p>
            ) : null}
            {sportsDiagnostics ? (
              <div className="diagnostic-results">
                <p className="muted">
                  {formatDiagnosticsSummary(sportsDiagnostics, lang)} · {t(lang, "diagnosticsRequests")}:{" "}
                  {sportsDiagnostics.probes.filter((probe) => probe.status !== "skipped").length} ·{" "}
                  {new Date(sportsDiagnostics.ranAt).toLocaleString()}
                </p>
                <details>
                  <summary>{t(lang, "diagnosticsDetails")}</summary>
                  {sportsDiagnostics.probes.map((probe) => (
                    <article
                      className={`diagnostic-card ${probe.status}`}
                      key={`${probe.provider}-${probe.label}`}
                    >
                      <div>
                        <strong>
                          {probe.provider} · {probe.label}
                        </strong>
                        <span>
                          {probe.status}
                          {typeof probe.httpStatus === "number" ? ` · HTTP ${probe.httpStatus}` : ""}
                          {typeof probe.durationMs === "number" ? ` · ${probe.durationMs}ms` : ""}
                        </span>
                      </div>
                      <small>{probe.endpoint}</small>
                      <p>{probe.message}</p>
                      <dl>
                        <div>
                          <dt>{t(lang, "diagnosticsFields")}</dt>
                          <dd>
                            {formatFields(probe.topLevelFields)}
                            {probe.samplePath ? ` · ${probe.samplePath}: ${formatFields(probe.sampleFields)}` : ""}
                          </dd>
                        </div>
                        <div>
                          <dt>{t(lang, "diagnosticsHeaders")}</dt>
                          <dd>{formatHeaders(probe.rateLimitHeaders)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </details>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <h2>{t(lang, "dataPackageTitle")}</h2>
          <p>{t(lang, "dataPackageDescription")}</p>
          <label>
            {t(lang, "dataManifestUrl")}
            <input
              value={settings.dataPackage.manifestUrl}
              onChange={(event) =>
                patch({
                  dataPackage: {
                    ...settings.dataPackage,
                    manifestUrl: event.target.value
                  }
                })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.dataPackage.autoCheck}
              onChange={(event) =>
                patch({
                  dataPackage: {
                    ...settings.dataPackage,
                    autoCheck: event.target.checked
                  }
                })
              }
            />
            {t(lang, "dataAutoCheck")}
          </label>
          <div className="tier-grid" aria-label={t(lang, "dataPackageTiersLabel")}>
            {DATA_PACKAGE_TIERS.map((tier) => (
              <label className="checkbox" key={tier.value}>
                <input
                  type="checkbox"
                  disabled={tier.value === "core"}
                  checked={normalizedSelectedTiers(settings.dataPackage.selectedTiers).includes(tier.value)}
                  onChange={(event) => toggleDataTier(tier.value, event.target.checked)}
                />
                <span>
                  {tier.label[lang]}
                  <small>{tier.description[lang]}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="data-package-panel">
            <dl>
              <div>
                <dt>{t(lang, "dataActiveVersion")}</dt>
                <dd>{dataState.activeDataVersion ?? t(lang, "dataBundledSeed")}</dd>
              </div>
              <div>
                <dt>{t(lang, "dataPreviousVersion")}</dt>
                <dd>{dataState.previousDataVersion ?? t(lang, "dataNone")}</dd>
              </div>
              <div>
                <dt>{t(lang, "dataLastPull")}</dt>
                <dd>{dataState.lastPulledAt ? new Date(dataState.lastPulledAt).toLocaleString() : t(lang, "dataNever")}</dd>
              </div>
              <div>
                <dt>{t(lang, "dataLastCheck")}</dt>
                <dd>{dataState.lastCheckedAt ? new Date(dataState.lastCheckedAt).toLocaleString() : t(lang, "dataNever")}</dd>
              </div>
              <div>
                <dt>{t(lang, "dataSelectedTiers")}</dt>
                <dd>
                  {normalizedSelectedTiers(settings.dataPackage.selectedTiers)
                    .map((tier) => formatDataTierLabel(tier, lang))
                    .join(", ")}
                </dd>
              </div>
            </dl>
            {dataSummary ? (
              <DataPackageSummaryBlock
                lang={lang}
                title={t(lang, "dataSummaryActive")}
                summary={dataSummary}
                sources={sourceSummary}
              />
            ) : null}
            {checkedDataSummary ? (
              <DataPackageSummaryBlock
                lang={lang}
                title={t(lang, "dataSummaryChecked")}
                summary={checkedDataSummary}
              />
            ) : null}
            <div className="data-actions">
              <button className="secondary" type="button" disabled={checkingData || pullingData} onClick={checkManifestOnly}>
                {checkingData ? t(lang, "dataCheckingManifest") : t(lang, "dataCheckManifest")}
              </button>
              <button className="secondary" type="button" disabled={pullingData || checkingData} onClick={pullRuntimeCorePackage}>
                {pullingData ? t(lang, "dataPullingData") : t(lang, "dataPullLatestCore")}
              </button>
              <button className="secondary" type="button" disabled={pullingData || checkingData} onClick={pullSelectedDataPackage}>
                {pullingData ? t(lang, "dataPullingData") : t(lang, "dataPullSelectedTiers")}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!dataState.previousDataVersion}
                onClick={rollbackDataPackage}
              >
                {t(lang, "dataRollback")}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!dataState.activeDataVersion}
                onClick={resetDataPackage}
              >
                {t(lang, "dataResetBundled")}
              </button>
            </div>
            {dataMessage ? <p className="muted">{dataMessage}</p> : null}
          </div>
        </section>

        <section>
          <h2>{t(lang, "replaySettings")}</h2>
          <label>
            Capture mode
            <select
              value={settings.replay.mode}
              onChange={(event) =>
                patch({
                  replay: {
                    ...settings.replay,
                    mode: event.target.value as "audio-only" | "video-audio"
                  }
                })
              }
            >
              <option value="video-audio">720p video + audio</option>
              <option value="audio-only">Audio only</option>
            </select>
          </label>
          <label>
            Replay window
            <select
              value={settings.replay.windowSeconds}
              onChange={(event) =>
                patch({
                  replay: {
                    ...settings.replay,
                    windowSeconds: Number(event.target.value) as 30 | 60 | 120
                  }
                })
              }
            >
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </label>
          <p>
            Instant Replay is available from the side panel. Evidence upload stays off until the
            user explicitly enables image or audio evidence there. Stop clears temporary frames and
            audio chunks.
          </p>
        </section>

        <button type="submit">{t(lang, "save")}</button>
        {saved ? <strong>{t(lang, "saved")}</strong> : null}
      </form>
    </main>
  );
}

function LLMProviderHelpBlock(props: { provider: UserSettings["llm"]["provider"]; lang: Language }) {
  const help = llmProviderHelp(props.provider, props.lang);
  return (
    <p>
      <span>{help.description}</span>
      {help.links.map((link) => (
        <a href={link.href} key={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </p>
  );
}

function TranscriptionProviderHelpBlock(props: { provider: UserSettings["transcription"]["provider"]; lang: Language }) {
  const help = transcriptionProviderHelp(props.provider, props.lang);
  return (
    <p>
      <span>{help.description}</span>
      {help.links.map((link) => (
        <a href={link.href} key={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </p>
  );
}

function formatProviderSwitchMessage(lang: Language, providerLabel: string): string {
  return lang === "zh"
    ? `已切换为 ${providerLabel}，之前填写过的配置会保存在本地。`
    : `Switched to ${providerLabel}. Previously entered settings are kept locally.`;
}

function llmProviderHelp(provider: UserSettings["llm"]["provider"], lang: Language): LLMProviderHelp {
  const option = getLLMProviderOption(provider);
  return {
    description: lang === "zh"
      ? `当前预设：${option.label}。${option.description.zh} 申请入口：`
      : `Current preset: ${option.label}. ${option.description.en} Get a key:`,
    links: option.links
  };
}

function transcriptionProviderHelp(provider: UserSettings["transcription"]["provider"], lang: Language): TranscriptionProviderHelp {
  const option = getTranscriptionProviderOption(provider);
  const supportNote = option.directUpload
    ? lang === "zh"
      ? "插件可直接测试这个 HTTP 上传接口。"
      : "The extension can test this HTTP upload endpoint directly."
    : lang === "zh"
      ? "官方接口不能用普通 Bearer/multipart 从浏览器直连；请先接服务端 adapter，再用自定义 Endpoint。"
      : "The official API cannot be called directly with simple browser Bearer/multipart upload; use a server-side adapter and configure it as Custom.";
  return {
    description: lang === "zh"
      ? `当前预设：${option.label}。${option.description.zh} ${supportNote} 申请入口：`
      : `Current preset: ${option.label}. ${option.description.en} ${supportNote} Get a key:`,
    links: option.links
  };
}

function formatFields(fields: string[]): string {
  return fields.length ? fields.join(", ") : "none";
}

function ConnectionTestResult(props: {
  result?: LLMConnectionTestResult | TranscriptionConnectionTestResult;
  lang: Language;
}) {
  if (!props.result) return null;
  return (
    <div className={props.result.ok ? "test-result ok" : "test-result error"}>
      <strong>{props.result.ok ? t(props.lang, "modelAvailable") : t(props.lang, "modelUnavailable")}</strong>
      <span>{props.result.message}</span>
      {"durationMs" in props.result && typeof props.result.durationMs === "number" ? (
        <small>{t(props.lang, "testDuration")}: {props.result.durationMs}ms</small>
      ) : null}
      {"reply" in props.result && props.result.reply ? <small>Reply: {props.result.reply}</small> : null}
      {"transcript" in props.result && props.result.transcript ? (
        <small>Transcript: {props.result.transcript}</small>
      ) : null}
    </div>
  );
}

function formatHeaders(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(", ")
    : "none";
}

function formatDiagnosticsSummary(result: SportsDiagnosticsResult, lang: Language): string {
  const active = result.probes.filter((probe) => probe.status !== "skipped");
  if (!active.length) return t(lang, "diagnosticsNoKeys");
  const ok = active.filter((probe) => probe.status === "ok").length;
  const failed = active.length - ok;
  const prefix = failed ? t(lang, "diagnosticsSummaryFail") : t(lang, "diagnosticsSummaryOk");
  return lang === "zh"
    ? `${prefix} 成功 ${ok} 项，失败 ${failed} 项。`
    : `${prefix} ${ok} ok, ${failed} failed.`;
}

function isBulkDataPackageTier(tier: DataPackageDownloadTier): boolean {
  return tier === "match-context" || tier === "player-context" || tier === "tournament-context" || tier === "audit";
}

function formatDataPullProgress(progress: PullDataPackageProgress, lang: Language): string {
  const bytes = formatBytes(progress.downloadedBytes);
  return lang === "zh"
    ? `正在预载数据：已检查 ${progress.checkedFiles}/${progress.totalFiles}，新增 ${progress.downloadedFiles}，跳过已缓存 ${progress.skippedFiles}，已下载 ${bytes}。`
    : `Preloading data: checked ${progress.checkedFiles}/${progress.totalFiles}, downloaded ${progress.downloadedFiles}, skipped cached ${progress.skippedFiles}, ${bytes}.`;
}

function normalizedSelectedTiers(tiers?: DataPackageDownloadTier[]): DataPackageDownloadTier[] {
  const allowed = new Set(DATA_PACKAGE_TIERS.map((tier) => tier.value));
  const next = new Set<DataPackageDownloadTier>(["core"]);
  for (const tier of tiers ?? []) {
    if (allowed.has(tier)) next.add(tier);
  }
  return [...next];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDataTierLabel(tier: DataPackageDownloadTier, lang: Language): string {
  return DATA_PACKAGE_TIERS.find((item) => item.value === tier)?.label[lang] ?? tier;
}

function formatFileCount(count: number, lang: Language): string {
  return `${count} ${t(lang, "dataFilesUnit")}`;
}

function formatSourceSummary(content?: string): string[] {
  if (!content) return [];
  try {
    const sources = JSON.parse(content) as Array<{
      name?: string;
      license?: string;
      publisher?: string;
      sourceCommit?: string;
      retrievedAt?: string;
    }>;
    if (!Array.isArray(sources)) return [];
    return sources.map((source) =>
      [
        source.name ?? "Unknown source",
        source.license ? `license ${source.license}` : undefined,
        source.publisher ? `publisher ${source.publisher}` : undefined,
        source.sourceCommit ? `commit ${source.sourceCommit}` : undefined,
        source.retrievedAt ? `retrieved ${new Date(source.retrievedAt).toLocaleDateString()}` : undefined
      ]
        .filter(Boolean)
        .join(" · ")
    );
  } catch {
    return ["Stored source summary could not be parsed."];
  }
}

function DataPackageSummaryBlock({
  lang,
  title,
  summary,
  sources = []
}: {
  lang: Language;
  title: string;
  summary: DataPackageManifestSummary;
  sources?: string[];
}) {
  const tierRows = Object.entries(summary.byTier).filter(([, value]) => value.files > 0);
  const topCategories = Object.entries(summary.byCategory)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 5);

  return (
    <article className="data-summary-card">
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>{t(lang, "dataVersion")}</dt>
          <dd>{summary.dataVersion}</dd>
        </div>
        <div>
          <dt>{t(lang, "dataGenerated")}</dt>
          <dd>{new Date(summary.generatedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t(lang, "dataFiles")}</dt>
          <dd>
            {formatFileCount(summary.fileCount, lang)} · {formatBytes(summary.totalBytes)}
          </dd>
        </div>
        <div>
          <dt>{t(lang, "dataRequiredCore")}</dt>
          <dd>
            {formatFileCount(summary.requiredFiles, lang)} · {formatBytes(summary.requiredBytes)}
          </dd>
        </div>
        <div>
          <dt>{t(lang, "dataLicense")}</dt>
          <dd>{summary.license}</dd>
        </div>
        <div>
          <dt>{t(lang, "dataGitCommit")}</dt>
          <dd>{summary.gitCommit}</dd>
        </div>
      </dl>
      <div className="summary-grid">
        <div>
          <strong>{t(lang, "dataDownloadTiers")}</strong>
          {tierRows.map(([tier, value]) => (
            <small key={tier}>
              {formatDataTierLabel(tier as DataPackageDownloadTier, lang)}: {formatFileCount(value.files, lang)} · {formatBytes(value.bytes)}
            </small>
          ))}
        </div>
        <div>
          <strong>{t(lang, "dataLargestCategories")}</strong>
          {topCategories.map(([category, value]) => (
            <small key={category}>
              {category}: {formatFileCount(value.files, lang)} · {formatBytes(value.bytes)}
            </small>
          ))}
        </div>
      </div>
      {sources.length ? (
        <div className="source-list">
          <strong>{t(lang, "dataSourcesList")}</strong>
          {sources.map((source) => (
            <small key={source}>{source}</small>
          ))}
        </div>
      ) : null}
    </article>
  );
}
