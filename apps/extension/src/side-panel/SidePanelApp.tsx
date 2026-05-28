import { useEffect, useMemo, useRef, useState } from "react";
import { buildAnalysisContext } from "../domain/analysis-context";
import {
  detectCurrentMatch,
  selectBestMatchDetection,
  summarizeMatchCandidates
} from "../domain/match-detection";
import { selectPrimaryMarket, selectTopMarkets } from "../domain/market-selection";
import { rankMarkets } from "../domain/market-ranking";
import {
  getReplayAudioMissingRequirements,
  getReplayAudioUploadWindowSeconds,
  hasReplayVisionModel,
  shouldUploadReplayAudio,
  shouldUploadReplayFrames
} from "../domain/replay-upload";
import {
  buildReplayAudioUnavailableContext,
  formatReplayAudioClipsDiagnostic,
  formatReplayTranscriptionStatus
} from "../domain/replay-audio-diagnostics";
import { formatReplayStatusLine, REPLAY_STATUS_REFRESH_MS } from "../domain/replay-status";
import { t } from "../i18n/messages";
import { runMatchAnalysis } from "../services/llm";
import {
  buildDataPackageMatchContext,
  type DataPackageMatchContext,
  loadRuntimeWorldCupMatches
} from "../services/data-runtime";
import { ensureCoreDataPackage } from "../services/data-package";
import { IndexedDbDataPackageStore } from "../services/data-store";
import {
  buildXLayerDappUrl,
  buildXLayerDappUrlForMarket,
  searchXLayerMarketsForMatch
} from "../services/xlayer-market";
import {
  loadSportsDataForMatch,
  sportsSnapshotsToEvents,
  sportsSnapshotsToSources,
  type SportsDataSnapshot
} from "../services/sports-data";
import { hasLLMSettings, loadSettings, saveSettings, watchSettings } from "../services/settings";
import { transcribeReplayAudioSegments } from "../services/transcription";
import {
  buildReplayCapturePlan,
  getActivePageContext,
  getActiveSidePanelTarget,
  getInstantReplaySnapshot,
  getInstantReplayStatus,
  openXLayerDappPopup,
  openXLayerDappTab,
  startInstantReplayCapture,
  stopInstantReplayCapture
} from "../shared/chrome-helpers";
import { applyDocumentTheme, getInitialDocumentTheme } from "../shared/theme";
import type {
  ChatConversationMessage,
  MatchCandidateReport,
  MatchDetectionReason,
  MatchDetectionResult,
  PageContext,
  RankedMarket,
  ReplayBufferSnapshot,
  UserSettings,
  WorldCupMatch
} from "../shared/types";

const dataStore = new IndexedDbDataPackageStore();

export default function SidePanelApp() {
  const [settings, setSettings] = useState<UserSettings>();
  const [pageContext, setPageContext] = useState<Partial<PageContext>>();
  const [detection, setDetection] = useState<MatchDetectionResult>();
  const [lowConfidenceCandidate, setLowConfidenceCandidate] = useState<MatchDetectionResult>();
  const [matchCandidateReport, setMatchCandidateReport] = useState<MatchCandidateReport[]>([]);
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<RankedMarket>();
  const [sportsData, setSportsData] = useState<SportsDataSnapshot[]>([]);
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatConversationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [manualMatchId, setManualMatchId] = useState("");
  const [runtimeMatches, setRuntimeMatches] = useState<WorldCupMatch[]>([]);
  const [dataPackageContext, setDataPackageContext] = useState<DataPackageMatchContext>({
    sources: [],
    recentEvents: [],
    rosterNotes: [],
    downloadedBytes: 0,
    downloadedFiles: 0
  });
  const [coreDataStatus, setCoreDataStatus] = useState("Bundled schedule seed");
  const [matchContextStatus, setMatchContextStatus] = useState("Match context not loaded yet.");
  const [marketStatus, setMarketStatus] = useState("Market signals not loaded yet.");
  const [sportsStatus, setSportsStatus] = useState("Sports data not loaded yet.");
  const [replayStatus, setReplayStatus] = useState<ReplayBufferSnapshot>();
  const [replayMessage, setReplayMessage] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>();
  const [initialTheme] = useState(getInitialDocumentTheme);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollChatRef = useRef(true);
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);
  const loadRequestIdRef = useRef(0);

  const lang = settings?.language ?? "en";
  const theme = settings?.theme ?? initialTheme;
  const listMarkets = useMemo(
    () => markets.filter((market) => !isSameMarketSurface(market, selectedMarket)),
    [markets, selectedMarket]
  );
  const currentMatchMarkets = useMemo(
    () => selectUniqueSurfaces([
      ...selectTopMarkets(listMarkets, "current-match", 3),
      ...selectTopMarkets(listMarkets, "team-related", 3)
    ]).slice(0, 3),
    [listMarkets]
  );
  const tournamentMarkets = useMemo(
    () => selectUniqueSurfaces(selectTopMarkets(listMarkets, "tournament", 3)),
    [listMarkets]
  );
  const sportsEvents = useMemo(() => sportsSnapshotsToEvents(sportsData), [sportsData]);
  const sportsSources = useMemo(() => sportsSnapshotsToSources(sportsData), [sportsData]);

  useEffect(() => {
    if (!shouldAutoScrollChatRef.current) return;
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
      return;
    }
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, busy]);

  useEffect(() => watchSettings(setSettings), []);

  useEffect(() => applyDocumentTheme(theme), [theme]);

  useEffect(() => {
    if (!replayStatus?.capturing) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getInstantReplayStatus().then((currentReplayStatus) => {
        if (active) setReplayStatus(currentReplayStatus);
      });
    }, REPLAY_STATUS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [replayStatus?.capturing]);

  useEffect(() => {
    let active = true;
    const loadRequestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = loadRequestId;
    const shouldApply = () => active && loadRequestIdRef.current === loadRequestId;

    async function load() {
      setCoreDataStatus("Checking local data package cache...");
      setMatchContextStatus("Waiting for match detection...");
      setMarketStatus("Waiting for match detection...");
      setSportsStatus("Waiting for match detection...");
      setMarkets([]);
      setSelectedMarket(undefined);
      setSportsData([]);
      setDataPackageContext({ sources: [], recentEvents: [], rosterNotes: [], downloadedBytes: 0, downloadedFiles: 0 });

      const [loadedSettings, matches, page] = await Promise.all([
        loadSettings(),
        loadRuntimeWorldCupMatches(dataStore),
        getActivePageContext()
      ]);
      if (!shouldApply()) return;

      setSettings(loadedSettings);
      setRuntimeMatches(matches);
      setPageContext(page);
      setCoreDataStatus("Using current local package cache.");

      if (loadedSettings.dataPackage.autoCheck && loadedSettings.dataPackage.manifestUrl.trim()) {
        void ensureCoreDataPackage({
          manifestUrl: loadedSettings.dataPackage.manifestUrl,
          store: dataStore
        })
          .then((coreResult) => {
            if (!shouldApply()) return;
            setCoreDataStatus(
              coreResult.downloadedFiles
                ? `Core cache updated: pulled ${coreResult.downloadedFiles} files (${coreResult.totalBytes} bytes).`
                : `Core cache ready for ${coreResult.dataVersion}; 0 new files downloaded.`
            );
          })
          .catch((error) => {
            if (!shouldApply()) return;
            setCoreDataStatus(`Data package check failed: ${error instanceof Error ? error.message : String(error)}`);
          });
      }

      const results = detectCurrentMatch({
        nowUtc: new Date().toISOString(),
        pageContext: page,
        matches
      });
      const manuallySelectedMatch = manualMatchId
        ? matches.find((match) => match.id === manualMatchId)
        : undefined;
      const selected = manuallySelectedMatch
        ? buildManualDetection(manuallySelectedMatch)
        : selectBestMatchDetection(results);
      const lowConfidence = selected ? undefined : results[0];
      const candidateReport = summarizeMatchCandidates(results);
      if (shouldApply()) {
        setDetection(selected);
        setLowConfidenceCandidate(lowConfidence);
        setMatchCandidateReport(candidateReport);
        setLastRefreshedAt(new Date().toLocaleTimeString());
      }

      void getInstantReplayStatus().then((currentReplayStatus) => {
        if (shouldApply()) setReplayStatus(currentReplayStatus);
      });

      if (!shouldApply()) return;
      if (!selected) {
        setMarketStatus("No confident match yet.");
        setSportsStatus("No confident match yet.");
        setMatchContextStatus("No confident match yet.");
        return;
      }

      setMarketStatus("Loading X Layer on-chain markets...");
      void searchXLayerMarketsForMatch(selected.match)
        .then((candidates) => {
          if (!shouldApply()) return;
          const ranked = rankMarkets(selected.match, candidates);
          setMarkets(ranked);
          setSelectedMarket(selectPrimaryMarket(ranked));
          setMarketStatus(
            ranked.length
              ? `Loaded ${ranked.length} X Layer outcome markets.`
              : "No X Layer market is seeded for this match yet; open the Dapp fallback."
          );
        })
        .catch((error) => {
          if (!shouldApply()) return;
          setMarkets([]);
          setSelectedMarket(undefined);
          setMarketStatus(`X Layer market load failed: ${error instanceof Error ? error.message : String(error)}`);
        });

      setSportsStatus("Loading sports API snapshots...");
      void loadSportsDataForMatch(loadedSettings, selected.match)
        .then((sportsSnapshots) => {
          if (!shouldApply()) return;
          setSportsData(sportsSnapshots);
          setSportsStatus(sportsSnapshots.length ? `Loaded ${sportsSnapshots.length} sports snapshots.` : "No sports snapshots loaded.");
        })
        .catch((error) => {
          if (!shouldApply()) return;
          setSportsData([]);
          setSportsStatus(`Sports data failed: ${error instanceof Error ? error.message : String(error)}`);
        });

      setMatchContextStatus("Loading match and player context...");
      void buildDataPackageMatchContext(dataStore, selected.match)
        .then((packageContext) => {
          if (!shouldApply()) return;
          setDataPackageContext(packageContext);
          const loadedItems = countLoadedContextItems(packageContext);
          setMatchContextStatus(
            packageContext.dataVersion
              ? packageContext.downloadedFiles
                ? `Pulled ${packageContext.downloadedFiles} files (${packageContext.downloadedBytes} bytes).`
                : loadedItems
                  ? "Context loaded from cache; 0 new files downloaded."
                  : "Context cache ready, but no match/player notes were found."
              : "Match context unavailable."
          );
        })
        .catch((error) => {
          if (!shouldApply()) return;
          setDataPackageContext({ sources: [], recentEvents: [], rosterNotes: [], downloadedBytes: 0, downloadedFiles: 0 });
          setMatchContextStatus(`Match context failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    load();
    return () => {
      active = false;
    };
  }, [manualMatchId, refreshNonce]);

  async function askAI() {
    if (busyRef.current || busy || !settings || !question.trim()) return;
    busyRef.current = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const userMessage: ChatConversationMessage = { role: "user", content: question.trim() };
    const nextConversation = [...chatMessages, userMessage];
    shouldAutoScrollChatRef.current = true;
    setChatMessages(nextConversation);
    setQuestion("");
    setBusy(true);
    const replayContext = await loadReplayContextForQuestion(settings, userMessage.content);
    if (replayContext.status) setReplayStatus(replayContext.status);
    if (replayContext.message) setReplayMessage(replayContext.message);
    const context = buildAnalysisContext({
      question: userMessage.content,
      detection,
      matchCandidates: matchCandidateReport,
      manualMatchId,
      pageContext,
      markets,
      recentEvents: [
        ...dataPackageContext.recentEvents,
        ...sportsEvents,
        ...replayContext.recentEvents
      ],
      rosterNotes: dataPackageContext.rosterNotes,
      sportsSnapshots: sportsData,
      extraSources: [...dataPackageContext.sources, ...sportsSources],
      transcript: replayContext.transcript,
      frames: replayContext.frames,
      replayFrameTimeline: replayContext.replayFrameTimeline
    });
    try {
      const response = await runMatchAnalysis({
        settings,
        context,
        conversation: nextConversation,
        onDelta: (content) => {
          if (requestIdRef.current !== requestId) return;
          setChatMessages([...nextConversation, { role: "assistant", content }]);
        }
      });
      if (requestIdRef.current === requestId) {
        setChatMessages([...nextConversation, { role: "assistant", content: response }]);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }

  async function startReplay() {
    if (!settings) return;
    setReplayMessage(undefined);
    const capturePlan = buildReplayCapturePlan(settings);
    if (!capturePlan.captureVideo && !capturePlan.captureAudio) {
      setReplayMessage(
        lang === "zh"
          ? "请先开启上传图片，或配置 ASR Endpoint 后开启上传音频。"
          : "Turn on image upload, or configure an ASR endpoint before turning on audio upload."
      );
      return;
    }
    try {
      const target = await getActiveSidePanelTarget();
      const status = await startInstantReplayCapture(settings, target);
      setReplayStatus(status);
      setReplayMessage(lang === "zh" ? "本地回看缓存已启动。" : "Local replay buffer started.");
    } catch (error) {
      setReplayMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopReplay() {
    setReplayMessage(undefined);
    try {
      const status = await stopInstantReplayCapture();
      setReplayStatus(status);
      setReplayMessage(
        lang === "zh"
          ? "本地回看缓存已停止，临时图片帧和音频已清理。"
          : "Local replay buffer stopped and temporary video frames/audio were cleared."
      );
    } catch (error) {
      setReplayMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function setReplayFrameUpload(uploadFramesToAI: boolean) {
    if (!settings) return;
    const nextSettings: UserSettings = {
      ...settings,
      replay: {
        ...settings.replay,
        uploadFramesToAI
      }
    };
    const message =
      uploadFramesToAI
        ? lang === "zh"
          ? "AI 图片依据已开启：涉及视频/画面的问题会附带抽样回看图片。"
          : "AI image evidence enabled. Vision-related questions may include sampled replay images."
        : lang === "zh"
          ? "AI 图片依据已关闭：之后提问不会上传回看图片。"
          : "AI image evidence disabled. Future questions will not upload replay images.";
    await saveReplaySettingsAndSync(nextSettings, message);
  }

  async function setReplayAudioUpload(uploadAudioToASR: boolean) {
    if (!settings) return;
    const nextSettings: UserSettings = {
      ...settings,
      replay: {
        ...settings.replay,
        uploadAudioToASR
      }
    };
    const missingAudio = getReplayAudioMissingRequirements(nextSettings);
    const message =
      uploadAudioToASR
        ? missingAudio.length === 0
          ? lang === "zh"
            ? "AI 音频转写已开启：提问时会把最近回放音频发送到你配置的 ASR 服务。"
            : "AI audio transcription enabled. Questions will send recent replay audio to your configured ASR service."
          : lang === "zh"
            ? `音频转写开关已开启，但缺少 ${missingAudio.join(", ")}；本地缓存不会捕获音频。`
            : `Audio transcription is enabled, but missing ${missingAudio.join(", ")}; local audio will not be captured.`
        : lang === "zh"
          ? "AI 音频转写已关闭：之后提问不会上传回放音频。"
          : "AI audio transcription disabled. Future questions will not upload replay audio.";
    await saveReplaySettingsAndSync(nextSettings, message);
  }

  async function saveReplaySettingsAndSync(nextSettings: UserSettings, message: string) {
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    if (!replayStatus?.capturing) {
      setReplayMessage(message);
      return;
    }

    const nextPlan = buildReplayCapturePlan(nextSettings);
    const currentPlan = {
      captureVideo: Boolean(replayStatus.captureVideo),
      captureAudio: Boolean(replayStatus.captureAudio)
    };
    if (nextPlan.captureVideo === currentPlan.captureVideo && nextPlan.captureAudio === currentPlan.captureAudio) {
      setReplayMessage(message);
      return;
    }

    try {
      if (!nextPlan.captureVideo && !nextPlan.captureAudio) {
        const status = await stopInstantReplayCapture();
        setReplayStatus(status);
        setReplayMessage(
          lang === "zh"
            ? `${message} 本地回看缓存已停止并清理。`
            : `${message} Local replay buffer stopped and cleared.`
        );
        return;
      }

      const target = await getActiveSidePanelTarget();
      const status = await startInstantReplayCapture(nextSettings, target);
      setReplayStatus(status);
      setReplayMessage(
        lang === "zh"
          ? `${message} 本地回看缓存已按新开关重启。`
          : `${message} Local replay buffer restarted with the new switches.`
      );
    } catch (error) {
      setReplayMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="panel-shell" data-theme={theme}>
      <header className="panel-header">
        <div>
          <h1>{t(lang, "title")}</h1>
          <p>{t(lang, "subtitle")}</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setRefreshNonce((value) => value + 1)}>
            {t(lang, "refresh")}
          </button>
          <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
            {t(lang, "settings")}
          </button>
        </div>
      </header>

      <section className="section match-hero">
        <span className="eyebrow">{t(lang, "detectedMatch")}</span>
        {detection ? (
          <>
            <h2>
              {detection.match.team1} vs {detection.match.team2}
            </h2>
            <p>
              {detection.match.stage} · {detection.match.group ?? "World Cup"} ·{" "}
              {detection.match.venue}
            </p>
          </>
        ) : (
          <>
            <p>{t(lang, "noMatch")}</p>
            {lowConfidenceCandidate ? (
              <p className="muted">
                {t(lang, "closestHint")}: {lowConfidenceCandidate.match.team1} vs{" "}
                {lowConfidenceCandidate.match.team2}
              </p>
            ) : null}
          </>
        )}
        <label className="match-picker">
          <span>{t(lang, "changeMatch")}</span>
          <select
            value={manualMatchId || detection?.match.id || ""}
            onChange={(event) => setManualMatchId(event.target.value)}
          >
            <option value="">{t(lang, "autoDetect")}</option>
            {runtimeMatches.map((match) => (
              <option value={match.id} key={match.id}>
                {match.team1} vs {match.team2} · {match.localDate}
              </option>
            ))}
          </select>
        </label>
        <ReplayQuickControls
          settings={settings}
          replayStatus={replayStatus}
          replayMessage={replayMessage}
          onStart={startReplay}
          onStop={stopReplay}
          onUploadFramesChange={setReplayFrameUpload}
          onUploadAudioChange={setReplayAudioUpload}
          lang={lang}
        />
        {lastRefreshedAt ? (
          <p className="muted">
            {t(lang, "lastUpdated")}: {lastRefreshedAt}
          </p>
        ) : null}
      </section>

      <section className="section">
        <h2>{t(lang, "aiAnalysis")}</h2>
        <div
          className="conversation"
          aria-live="polite"
          ref={conversationRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            shouldAutoScrollChatRef.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 28;
          }}
        >
          {chatMessages.length === 0 ? (
            <p className="muted">{t(lang, "askHint")}</p>
          ) : null}
          {chatMessages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "user" ? "You" : "AI"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-box">
          <textarea
            placeholder={t(lang, "askPlaceholder")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                void askAI();
              }
            }}
          />
          <button type="button" disabled={busy || !settings || !hasLLMSettings(settings)} onClick={askAI}>
            {busy ? t(lang, "analyzing") : t(lang, "ask")}
          </button>
        </div>
        {!settings || !hasLLMSettings(settings) ? <p className="muted">{t(lang, "aiNotConfigured")}</p> : null}
      </section>

      <section className="section market-preview">
        <h2>{t(lang, "previewMarket")}</h2>
        {selectedMarket ? (
          <>
            <div className="selected-market-summary">
              <strong>{selectedMarket.title}</strong>
              <span>{formatMarketSnapshot(selectedMarket)}</span>
            </div>
            <XLayerMarketPreview market={selectedMarket} lang={lang} />
            <div className="button-row">
              <button type="button" onClick={() => openXLayerDappPopup(buildXLayerDappUrlForMarket(selectedMarket))}>
                {t(lang, "trade")}
              </button>
              <button type="button" onClick={() => openXLayerDappTab(buildXLayerDappUrlForMarket(selectedMarket))}>
                {t(lang, "openTab")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{marketStatus || t(lang, "noMarkets")}</p>
            {detection ? (
              <div className="button-row">
                <button type="button" onClick={() => openXLayerDappPopup(buildXLayerDappUrl(detection.match))}>
                  {t(lang, "openDapp")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <MarketGroup
        title={t(lang, "currentMatchMarkets")}
        lang={lang}
        markets={currentMatchMarkets}
        selectedId={selectedMarket?.id}
        onSelect={setSelectedMarket}
      />

      <MarketGroup
        title={t(lang, "tournamentMarkets")}
        lang={lang}
        markets={tournamentMarkets}
        selectedId={selectedMarket?.id}
        onSelect={setSelectedMarket}
      />

      <section className="section data-card">
        <h2>{t(lang, "dataSources")}</h2>
        {sportsData.length ? (
          sportsData.map((snapshot) => (
            <p className="muted" key={snapshot.provider}>
              {snapshot.provider}: {snapshot.message}
            </p>
          ))
        ) : (
          <p className="muted">{sportsStatus}</p>
        )}
      </section>

      <DataContextStatus
        coreStatus={coreDataStatus}
        matchStatus={matchContextStatus}
        marketStatus={marketStatus}
        sportsStatus={sportsStatus}
        context={dataPackageContext}
        selectedMatch={detection?.match}
        detection={detection}
        candidates={matchCandidateReport}
        lang={lang}
        onSelectMatch={setManualMatchId}
      />
    </main>
  );
}

function DataContextStatus(props: {
  coreStatus: string;
  matchStatus: string;
  marketStatus: string;
  sportsStatus: string;
  context: DataPackageMatchContext;
  selectedMatch?: WorldCupMatch;
  detection?: MatchDetectionResult;
  candidates: MatchCandidateReport[];
  lang: UserSettings["language"];
  onSelectMatch: (matchId: string) => void;
}) {
  const rosterPreview = props.context.rosterNotes.slice(0, 2);
  const eventPreview = props.context.recentEvents.slice(0, 2);
  const simulated = props.context.rosterNotes.some((note) => /simulated|available-simulated/i.test(note));

  return (
    <section className="section context-card">
      <div className="section-heading-row">
        <h2>{t(props.lang, "dataContext")}</h2>
        {props.selectedMatch ? <span>{props.selectedMatch.team1} vs {props.selectedMatch.team2}</span> : null}
      </div>
      <div className="context-grid">
        <ContextMetric label={t(props.lang, "loadedNotes")} value={countLoadedContextItems(props.context)} />
        <ContextMetric label={t(props.lang, "sourcesLabel")} value={props.context.sources.length} />
        <ContextMetric label={t(props.lang, "newDownloads")} value={props.context.downloadedFiles} />
        <ContextMetric label={t(props.lang, "fetched")} value={formatBytes(props.context.downloadedBytes)} />
      </div>
      <div className="context-status-list">
        <p className="muted">{t(props.lang, "coreLabel")}: {formatRuntimeStatus(props.coreStatus, props.lang)}</p>
        <p className="muted">{t(props.lang, "matchPlayerLabel")}: {formatRuntimeStatus(props.matchStatus, props.lang)}</p>
        <p className="muted">{t(props.lang, "marketsLabel")}: {formatRuntimeStatus(props.marketStatus, props.lang)}</p>
        <p className="muted">{t(props.lang, "sportsApiLabel")}: {formatRuntimeStatus(props.sportsStatus, props.lang)}</p>
        {props.context.dataVersion ? <p className="muted">{t(props.lang, "versionLabel")}: {props.context.dataVersion}</p> : null}
        {simulated ? <p className="muted">{t(props.lang, "simulatedRosterWarning")}</p> : null}
      </div>
      {props.detection ? <DetectionReasons detection={props.detection} lang={props.lang} /> : null}
      <CandidateReport candidates={props.candidates} lang={props.lang} onSelectMatch={props.onSelectMatch} />
      {eventPreview.length || rosterPreview.length ? (
        <details className="context-details">
          <summary>{t(props.lang, "contextPreviewSent")}</summary>
          {[...eventPreview, ...rosterPreview].map((line) => (
            <p className="muted" key={line}>{line}</p>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function ReplayQuickControls(props: {
  settings?: UserSettings;
  replayStatus?: ReplayBufferSnapshot;
  replayMessage?: string;
  onStart: () => void;
  onStop: () => void;
  onUploadFramesChange: (enabled: boolean) => void;
  onUploadAudioChange: (enabled: boolean) => void;
  lang: UserSettings["language"];
}) {
  const enabled = Boolean(props.settings);
  const framesEnabled = Boolean(props.settings?.replay.uploadFramesToAI);
  const audioEnabled = Boolean(props.settings?.replay.uploadAudioToASR);
  const visionModelReady = hasReplayVisionModel(props.settings);
  const audioMissing = getReplayAudioMissingRequirements(props.settings);
  const audioModelReady = audioMissing.length === 0;
  const imageDisabled = !enabled || props.settings?.replay.mode === "audio-only" || !visionModelReady;
  const audioDisabled = !enabled || !audioModelReady;
  return (
    <div className="replay-quick" aria-live="polite">
      <div>
        <strong>{t(props.lang, "replaySettings")}</strong>
        <p className="muted replay-status-line">{formatReplayStatusLine(props.lang, props.settings, props.replayStatus)}</p>
        <p className="muted">{t(props.lang, "replayExplanation")}</p>
      </div>
      <div className="button-row">
        <button type="button" disabled={!enabled || props.replayStatus?.capturing} onClick={props.onStart}>
          {t(props.lang, "startLocalBuffer")}
        </button>
        <button type="button" disabled={!enabled || !props.replayStatus?.capturing} onClick={props.onStop}>
          {t(props.lang, "stopLocalBuffer")}
        </button>
      </div>
      <p className="muted">{enabled ? `${t(props.lang, "replayStopClears")} ${t(props.lang, "replayResourceWarning")}` : t(props.lang, "replayOff")}</p>
      <div className="replay-toggle-row">
        <label className="replay-upload-toggle">
          <input
            type="checkbox"
            disabled={imageDisabled}
            checked={framesEnabled}
            onChange={(event) => props.onUploadFramesChange(event.target.checked)}
          />
          <span>{t(props.lang, "replayUploadFrames")}</span>
        </label>
        <label className="replay-upload-toggle">
          <input
            type="checkbox"
            disabled={audioDisabled}
            checked={audioEnabled}
            onChange={(event) => props.onUploadAudioChange(event.target.checked)}
          />
          <span>{t(props.lang, "replayUploadAudio")}</span>
        </label>
      </div>
      {!visionModelReady ? <p className="muted">{t(props.lang, "replayMissingVisionModel")}</p> : null}
      {audioMissing.length ? (
        <p className="muted">
          {t(props.lang, "replayMissingAudioModel")}: {audioMissing.join(", ")}
        </p>
      ) : null}
      <p className="muted">{t(props.lang, "replayUploadFramesHelp")} {t(props.lang, "replayUploadAudioHelp")}</p>
      {props.replayMessage ? <p className="muted replay-message">{props.replayMessage}</p> : null}
    </div>
  );
}

function formatRuntimeStatus(status: string, lang: UserSettings["language"]): string {
  if (lang !== "zh") return status;

  const replacements: Array<[RegExp, string]> = [
    [/^Bundled schedule seed$/, "内置赛程种子"],
    [/^Match context not loaded yet\.$/, "比赛上下文尚未载入。"],
    [/^Market signals not loaded yet\.$/, "市场信号尚未载入。"],
    [/^Sports data not loaded yet\.$/, "体育数据尚未载入。"],
    [/^Checking local data package cache\.\.\.$/, "正在检查本地数据包缓存..."],
    [/^Waiting for match detection\.\.\.$/, "等待比赛识别..."],
    [/^Using current local package cache\.$/, "使用当前本地数据包缓存。"],
    [/^Core cache ready for (.+); 0 new files downloaded\.$/, "核心缓存已就绪：$1；新增下载 0 个文件。"],
    [/^Core cache updated: pulled (\d+) files \((.+) bytes\)\.$/, "核心缓存已更新：拉取 $1 个文件（$2 bytes）。"],
    [/^Data package check failed: (.+)$/, "数据包检查失败：$1"],
    [/^No confident match yet\.$/, "尚未高置信识别比赛。"],
    [/^Loading X Layer on-chain markets\.\.\.$/, "正在加载 X Layer 链上市场..."],
    [/^Loaded (\d+) X Layer outcome markets\.$/, "已载入 $1 个 X Layer 结果市场。"],
    [/^No X Layer market is seeded for this match yet; open the Dapp fallback\.$/, "这场比赛尚未配置 X Layer 市场，可打开 Dapp 兜底入口。"],
    [/^X Layer market load failed: (.+)$/, "X Layer 市场载入失败：$1"],
    [/^Loading sports API snapshots\.\.\.$/, "正在加载体育 API 快照..."],
    [/^Loaded (\d+) sports snapshots\.$/, "已载入 $1 个体育 API 快照。"],
    [/^No sports snapshots loaded\.$/, "没有载入体育 API 快照。"],
    [/^Sports data failed: (.+)$/, "体育数据失败：$1"],
    [/^Loading match and player context\.\.\.$/, "正在加载比赛和球员上下文..."],
    [/^Pulled (\d+) files \((.+) bytes\)\.$/, "拉取 $1 个文件（$2 bytes）。"],
    [/^Context loaded from cache; 0 new files downloaded\.$/, "上下文已从缓存载入；新增下载 0 个文件。"],
    [/^Context cache ready, but no match\/player notes were found\.$/, "上下文缓存已就绪，但没有找到比赛/球员说明。"],
    [/^Match context unavailable\.$/, "比赛上下文不可用。"],
    [/^Match context failed: (.+)$/, "比赛上下文失败：$1"]
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(status)) return status.replace(pattern, replacement);
  }
  return status;
}

function ContextMetric(props: { label: string; value: number | string }) {
  return (
    <div className="context-metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function countLoadedContextItems(context: DataPackageMatchContext): number {
  return context.recentEvents.length + context.rosterNotes.length;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function loadReplayContextForQuestion(
  settings: UserSettings,
  question: string
): Promise<{
  frames?: string[];
  replayFrameTimeline?: { index: number; capturedAt: string }[];
  transcript?: string;
  recentEvents: string[];
  message?: string;
  status?: ReplayBufferSnapshot;
}> {
  const includeFrames = shouldUploadReplayFrames(settings, question);
  const includeAudio = shouldUploadReplayAudio(settings, question);

  if (!includeFrames && !includeAudio) {
    return { recentEvents: [] };
  }

  try {
    const status = await getInstantReplaySnapshot(includeFrames ? 6 : 0, {
      includeAudio,
      maxAudioSeconds: getReplayAudioUploadWindowSeconds(settings)
    });
    const sampledFrames = status.frames ?? [];
    const frames = sampledFrames.map((frame) => frame.dataUrl).filter(Boolean);
    const audioClips = status.audioClips?.length ? status.audioClips : status.audioClip ? [status.audioClip] : [];
    const audioResult = includeAudio ? await transcribeReplayAudioSegments(settings, audioClips) : undefined;
    const recentEvents: string[] = [];
    let message: string | undefined;

    if (includeFrames) {
      if (frames.length) {
        recentEvents.push(
          `Instant Replay attached ${frames.length} sampled local frames from the rolling buffer for this user-triggered question.`
        );
        message = `Attached ${frames.length} replay frames to AI analysis.`;
      } else {
        recentEvents.push("Instant Replay was requested, but no local video frames are available yet.");
        message = "Instant Replay has no video frames yet.";
      }
    }

    if (audioResult?.transcript) {
      const audioDiagnostic = formatReplayAudioClipsDiagnostic(audioClips);
      recentEvents.push(
        `Instant Replay audio was transcribed by the user's configured ASR provider and attached as auxiliary text evidence. Captured audio: ${audioDiagnostic}.`
      );
      const audioStatus = formatReplayTranscriptionStatus(audioResult, audioDiagnostic);
      message = message
        ? `${message} ${audioStatus}`
        : audioStatus;
    } else if (audioResult?.status === "failed") {
      const audioDiagnostic = formatReplayAudioClipsDiagnostic(audioClips);
      const userMessage = `${audioResult.message} Captured audio: ${audioDiagnostic}. If the user asked about speech, say the ASR transcript is unavailable; do not infer spoken words from page context or image frames unless clearly labelled as visual/subtitle evidence.`;
      recentEvents.push(buildReplayAudioUnavailableContext(audioDiagnostic));
      message = message ? `${message} ${userMessage}` : userMessage;
    } else if (audioResult?.status === "skipped") {
      recentEvents.push(audioResult.message);
      message = message ? `${message} ${audioResult.message}` : audioResult.message;
    }

    return {
      frames: frames.length ? frames : undefined,
      replayFrameTimeline: sampledFrames.map((frame, index) => ({
        index: index + 1,
        capturedAt: frame.capturedAt
      })),
      transcript: audioResult?.transcript,
      status,
      recentEvents,
      message
    };
  } catch (error) {
    return {
      recentEvents: [`Instant Replay snapshot failed: ${error instanceof Error ? error.message : String(error)}`],
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function CandidateReport(props: {
  candidates: MatchCandidateReport[];
  lang: UserSettings["language"];
  onSelectMatch: (matchId: string) => void;
}) {
  if (!props.candidates.length) return null;
  return (
    <details className="candidate-report">
      <summary>{t(props.lang, "candidateMatches")}</summary>
      <div className="candidate-list">
        {props.candidates.map((candidate) => (
          <div className="candidate-row" key={candidate.matchId}>
            <strong>{candidate.label}</strong>
            <small>{candidate.matchId}</small>
            <div>
              {candidate.reasons.map((reason) => (
                <span key={reason}>{reasonLabel(reason, props.lang)}</span>
              ))}
            </div>
            <small>
              {t(props.lang, "sourceFields")}: {candidate.sourceFields.join(", ") || "none"}
            </small>
            <button type="button" onClick={() => props.onSelectMatch(candidate.matchId)}>
              {t(props.lang, "selectCandidate")}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

function XLayerMarketPreview(props: { market: RankedMarket; lang: UserSettings["language"] }) {
  const oddsLabel =
    typeof props.market.payoutMultiple === "number" ? `${props.market.payoutMultiple.toFixed(2)}x` : "--";
  const oddsSourceLabel = props.market.oddsSource === "reference"
    ? props.lang === "zh" ? "参考倍率" : "Reference odds"
    : props.lang === "zh" ? "链上倍率" : "On-chain odds";
  return (
    <div className="xlayer-preview-card">
      <div>
        <span>{props.lang === "zh" ? "选项" : "Outcome"}</span>
        <strong>{formatOutcomeIntent(props.market, props.lang)}</strong>
      </div>
      <div>
        <span>{props.lang === "zh" ? "当前池子" : "Outcome pool"}</span>
        <strong>{formatUsdt(props.market.poolAmountUsdt)}</strong>
      </div>
      <div>
        <span>{props.lang === "zh" ? "总池子" : "Total pool"}</span>
        <strong>{formatUsdt(props.market.totalPoolUsdt)}</strong>
      </div>
      <div>
        <span>{oddsSourceLabel}</span>
        <strong>{oddsLabel}</strong>
      </div>
      <p className="muted">
        {props.lang === "zh"
          ? "真实交易在 X Layer Dapp 内完成，插件只传递比赛和结果意图。"
          : "Real trading happens in the X Layer Dapp; the extension only passes match and outcome intent."}
      </p>
    </div>
  );
}

function MarketGroup(props: {
  title: string;
  lang: UserSettings["language"];
  markets: RankedMarket[];
  selectedId?: string;
  onSelect: (market: RankedMarket) => void;
}) {
  return (
    <section className="section">
      <h2>{props.title}</h2>
      <div className="market-cards">
        {props.markets.length === 0 ? <p className="muted">{t(props.lang, "noMarkets")}</p> : null}
        {props.markets.map((market) => (
          <div className="market-item" key={market.id}>
            <button
              className={market.id === props.selectedId ? "market-card selected" : "market-card"}
              type="button"
              onClick={() => props.onSelect(market)}
            >
              <span>{market.title}</span>
              <small>{market.relevanceReason}</small>
              <small>{formatMarketSnapshot(market)}</small>
              <strong>{formatYesPrice(market)}</strong>
            </button>
            <div className="market-actions">
              <button type="button" onClick={() => props.onSelect(market)}>
                {t(props.lang, "previewMarketAction")}
              </button>
              <button type="button" onClick={() => openXLayerDappPopup(buildXLayerDappUrlForMarket(market))}>
                {t(props.lang, "trade")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildManualDetection(match: WorldCupMatch): MatchDetectionResult {
  return {
    match,
    confidence: 100,
    evidence: ["Selected from schedule."],
    reasons: ["manual"],
    sourceFields: ["schedule"],
    detectedAt: new Date().toISOString()
  };
}

function DetectionReasons(props: { detection: MatchDetectionResult; lang: UserSettings["language"] }) {
  const reasons = (props.detection.reasons ?? []).map((reason) => reasonLabel(reason, props.lang));
  if (!reasons.length) return null;
  return (
    <details className="detection-reasons">
      <summary>{t(props.lang, "whyThisMatch")}</summary>
      <div>
        {reasons.map((reason) => (
          <span key={reason}>{reason}</span>
        ))}
      </div>
    </details>
  );
}

function reasonLabel(reason: MatchDetectionReason, lang: UserSettings["language"]): string {
  const keyByReason: Record<MatchDetectionReason, Parameters<typeof t>[1]> = {
    time: "reasonTime",
    team: "reasonTeam",
    group: "reasonGroup",
    venue: "reasonVenue",
    query: "reasonQuery",
    manual: "reasonManual"
  };
  return t(lang, keyByReason[reason]);
}

function formatYesPrice(market: RankedMarket): string {
  if (typeof market.payoutMultiple === "number") return `${market.payoutMultiple.toFixed(2)}x`;
  return typeof market.yesPrice === "number" ? `${Math.round(market.yesPrice * 100)}%` : `${market.relevanceScore}`;
}

function formatOutcomeIntent(market: RankedMarket, lang: UserSettings["language"]): string {
  if (market.outcomeIntent === "teamA") return lang === "zh" ? "A 队胜" : "Team A win";
  if (market.outcomeIntent === "teamB") return lang === "zh" ? "B 队胜" : "Team B win";
  if (market.outcomeIntent === "draw") return lang === "zh" ? "平局" : "Draw";
  return market.title;
}

function formatUsdt(value?: number): string {
  return typeof value === "number" ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT0` : "--";
}

function isSameMarketSurface(market: RankedMarket, selected?: RankedMarket): boolean {
  if (!selected) return false;
  return Boolean(
    market.id === selected.id ||
      (market.slug && market.slug === selected.slug) ||
      (market.eventSlug && market.eventSlug === selected.eventSlug) ||
      market.officialUrl === selected.officialUrl
  );
}

function selectUniqueSurfaces(markets: RankedMarket[]): RankedMarket[] {
  const seen = new Set<string>();
  return markets.filter((market) => {
    const key = market.eventSlug || market.slug || market.officialUrl || market.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatMarketSnapshot(market: RankedMarket): string {
  if (market.provider === "XLayer") {
    const pool = formatUsdt(market.poolAmountUsdt);
    const total = formatUsdt(market.totalPoolUsdt);
    const odds = typeof market.payoutMultiple === "number" ? `${market.payoutMultiple.toFixed(2)}x` : "--";
    const oddsSource = market.oddsSource === "reference" ? "Reference" : "On-chain";
    return `Pool ${pool} / Total ${total} / ${oddsSource} odds ${odds}`;
  }
  const bidAsk =
    typeof market.bestBid === "number" && typeof market.bestAsk === "number"
      ? `Bid ${Math.round(market.bestBid * 100)}% / Ask ${Math.round(market.bestAsk * 100)}%`
      : "Live market";
  const orderState = market.acceptingOrders === false ? " · Orders paused" : "";
  const liquidity =
    typeof market.liquidity === "number" ? ` · Liq $${Math.round(market.liquidity).toLocaleString()}` : "";
  return `${bidAsk}${orderState}${liquidity}`;
}
