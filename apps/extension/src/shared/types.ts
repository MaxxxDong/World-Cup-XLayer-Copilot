export type Language = "en" | "zh";

export type ThemeMode = "white" | "yellow" | "black";

export type MarketGroup = "current-match" | "team-related" | "tournament" | "related" | "other";

export interface SourceMetadata {
  sourceName: string;
  sourceUrl: string;
  sourceTimestamp: string;
}

export interface WorldCupMatch {
  id: string;
  kickoffUtc: string;
  localDate?: string;
  localTime?: string;
  timezone?: string;
  team1: string;
  team2: string;
  teamAliases: Record<string, string[]>;
  group?: string;
  stage: string;
  venue: string;
  source: SourceMetadata;
  marketSearchQueries?: string[];
  identification?: MatchIdentificationSignals;
  dataPackageTeamIds?: {
    homeTeamId: string;
    awayTeamId: string;
  };
}

export interface MatchIdentificationSignals {
  defaultWeights?: MatchIdentificationWeights;
  hasPlaceholderTeam?: boolean;
  queryHints?: string[];
  teams?: Array<{
    side: "home" | "away";
    teamId: string;
    name: string;
    aliases: string[];
    fifaCode?: string;
    identityConfidence?: string;
    isPlaceholder?: boolean;
  }>;
  venueAliases?: string[];
}

export interface MatchIdentificationWeights {
  teamAlias: number;
  placeholderTeamAlias: number;
  venueAlias: number;
  timeWindow: number;
  marketQuery: number;
}

export interface PageContext {
  url: string;
  title: string;
  visibleText: string;
  capturedAt: string;
}

export interface MatchDetectionInput {
  nowUtc: string;
  pageContext?: Partial<PageContext>;
  matches: WorldCupMatch[];
}

export interface MatchDetectionResult {
  match: WorldCupMatch;
  confidence: number;
  evidence: string[];
  reasons?: MatchDetectionReason[];
  sourceFields: string[];
  detectedAt: string;
}

export type MatchDetectionReason = "time" | "team" | "group" | "venue" | "query" | "manual";

export interface MatchCandidateReport {
  confidence: number;
  label: string;
  matchId: string;
  reasons: MatchDetectionReason[];
  sourceFields: string[];
}

export interface MatchSelectionContext {
  matchId?: string;
  mode: "auto" | "manual" | "none";
}

export interface MarketCandidate {
  id: string;
  provider?: "XLayer";
  marketId?: string;
  outcomeIntent?: "teamA" | "teamB" | "draw";
  oddsSource?: "on-chain" | "reference";
  contractAddress?: string;
  chainId?: number;
  poolAmountUsdt?: number;
  totalPoolUsdt?: number;
  payoutMultiple?: number;
  referenceProbability?: number;
  closeTimeUtc?: string;
  settlementSource?: string;
  slug?: string;
  eventSlug?: string;
  eventTitle?: string;
  title: string;
  description?: string;
  active: boolean;
  closed: boolean;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  outcomes?: string[];
  yesPrice?: number;
  noPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number;
  volume?: number;
  lastTradePrice?: number;
  priceChange?: {
    m5?: number;
    m15?: number;
    h1?: number;
    h24?: number;
    sinceKickoff?: number;
  };
  officialUrl: string;
}

export interface RankedMarket extends MarketCandidate {
  group: MarketGroup;
  relevanceScore: number;
  scoreParts: Record<string, number>;
  relevanceReason: string;
}

export interface PredictionMarketSignal {
  id: string;
  provider?: MarketCandidate["provider"];
  marketId?: string;
  outcomeIntent?: MarketCandidate["outcomeIntent"];
  oddsSource?: MarketCandidate["oddsSource"];
  contractAddress?: string;
  chainId?: number;
  title: string;
  eventTitle?: string;
  group: MarketGroup;
  relevanceScore: number;
  relevanceReason: string;
  yesPrice?: number;
  noPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  liquidity?: number;
  volume?: number;
  poolAmountUsdt?: number;
  totalPoolUsdt?: number;
  payoutMultiple?: number;
  referenceProbability?: number;
  priceChange?: MarketCandidate["priceChange"];
  acceptingOrders?: boolean;
  officialUrl: string;
}

export interface PredictionMarketContext {
  provider: "XLayer";
  sourceName: "X Layer WorldCupTriMarket contract";
  sourceUrl: string;
  dataRole: string;
  marketCount: number;
  topSignals: PredictionMarketSignal[];
}

export type SportsDataProvider = "football-data.org" | "API-Football";

export type SportsDataStatus = "not-configured" | "loaded" | "empty" | "rate-limited" | "error";

export type LiveFixtureStatus = "scheduled" | "live" | "paused" | "finished" | "postponed" | "cancelled" | "suspended" | "unknown";

export interface LiveSportsScoreSide {
  home?: number;
  away?: number;
}

export interface LiveSportsTeamSide {
  providerTeamId?: string;
  name: string;
  winner?: boolean;
}

export interface LiveSportsFixture {
  provider: SportsDataProvider;
  fixtureId: string;
  kickoffUtc?: string;
  status: {
    code?: string;
    label?: string;
    normalized: LiveFixtureStatus;
    elapsed?: number;
    extra?: number;
  };
  teams: {
    home: LiveSportsTeamSide;
    away: LiveSportsTeamSide;
  };
  score?: LiveSportsScoreSide & {
    halfTime?: LiveSportsScoreSide;
    fullTime?: LiveSportsScoreSide;
    extraTime?: LiveSportsScoreSide;
    penalties?: LiveSportsScoreSide;
  };
  venue?: {
    name?: string;
    city?: string;
  };
  competition?: {
    providerCompetitionId?: string;
    name?: string;
    code?: string;
    season?: number;
    round?: string;
    stage?: string;
    group?: string;
    matchday?: number;
  };
  providerUpdatedAt?: string;
}

export interface SportsDataSnapshot {
  provider: SportsDataProvider;
  status: SportsDataStatus;
  message: string;
  events: string[];
  fixtures?: LiveSportsFixture[];
  source?: SourceMetadata;
}

export interface LiveSportsSignal {
  provider: SportsDataProvider;
  status: SportsDataStatus;
  message: string;
  eventCount: number;
  events: string[];
  fixtures: LiveSportsFixture[];
  sourceName?: string;
  sourceUrl?: string;
}

export interface LiveSportsContext {
  dataRole: string;
  snapshots: LiveSportsSignal[];
}

export type LLMProviderPreset =
  | "openai"
  | "openrouter"
  | "google-gemini"
  | "xai-grok"
  | "deepseek"
  | "aliyun-dashscope"
  | "tencent-hunyuan"
  | "volcengine-ark"
  | "zhipu-bigmodel"
  | "moonshot-kimi"
  | "custom";

export type TranscriptionProviderPreset =
  | "openai-transcribe"
  | "groq-whisper"
  | "deepgram-nova"
  | "aliyun-dashscope-asr"
  | "tencent-cloud-asr"
  | "volcengine-doubao-asr"
  | "custom";

export interface LLMProviderProfile {
  baseURL: string;
  apiKey: string;
  model: string;
  visionModel?: string;
}

export type TranscriptionWindowSeconds = 5 | 10 | 15 | 30 | 60;

export interface TranscriptionProviderProfile {
  endpoint: string;
  apiKey: string;
  model: string;
  maxSeconds?: TranscriptionWindowSeconds;
}

export interface UserSettings {
  language: Language;
  theme: ThemeMode;
  llm: {
    provider: LLMProviderPreset;
    baseURL: string;
    apiKey: string;
    model: string;
    visionModel?: string;
    providerProfiles?: Partial<Record<LLMProviderPreset, LLMProviderProfile>>;
  };
  sports: {
    apiFootballKey?: string;
    footballDataKey?: string;
  };
  replay: {
    enabled: boolean;
    windowSeconds: 30 | 60 | 120;
    mode: "audio-only" | "video-audio";
    uploadFramesToAI: boolean;
    uploadAudioToASR: boolean;
  };
  transcription: {
    enabled: boolean;
    provider: TranscriptionProviderPreset;
    endpoint: string;
    apiKey: string;
    model: string;
    maxSeconds: TranscriptionWindowSeconds;
    providerProfiles?: Partial<Record<TranscriptionProviderPreset, TranscriptionProviderProfile>>;
  };
  dataPackage: {
    manifestUrl: string;
    autoCheck: boolean;
    selectedTiers: DataPackageDownloadTier[];
  };
}

export interface ReplayFrame {
  capturedAt: string;
  dataUrl: string;
  width: number;
  height: number;
  motionScore?: number;
}

export interface ReplayAudioClip {
  capturedAt: string;
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  durationSeconds?: number;
  chunkCount?: number;
  firstChunkAt?: string;
  latestChunkAt?: string;
  diagnostics?: ReplayAudioClipDiagnostics;
}

export interface ReplayAudioClipDiagnostics {
  decodeStatus: "ok" | "failed" | "unavailable";
  decodedDurationSeconds?: number;
  rms?: number;
  peak?: number;
  silent?: boolean;
  reason?: string;
}

export interface ReplayBufferSnapshot {
  replayEnabled: boolean;
  capturing: boolean;
  windowSeconds: UserSettings["replay"]["windowSeconds"];
  mode: UserSettings["replay"]["mode"];
  captureVideo?: boolean;
  captureAudio?: boolean;
  frameCount: number;
  chunkCount?: number;
  audioChunkCount?: number;
  audioBytes?: number;
  audioDurationSeconds?: number;
  frameBytes?: number;
  chunkBytes?: number;
  startedAt?: string;
  latestFrameAt?: string;
  frames?: ReplayFrame[];
  audioClip?: ReplayAudioClip;
  audioClips?: ReplayAudioClip[];
}

export type DataPackageDownloadTier = "core" | "match-context" | "tournament-context" | "player-context" | "audit" | "optional";

export interface DataPackageFile {
  path: string;
  category: string;
  downloadTier: DataPackageDownloadTier;
  required: boolean;
  sha256: string;
  sizeBytes: number;
  recordCount?: number;
  updatedAt: string;
}

export interface DataPackageFileIndex extends DataPackageFile {
  categories?: string[];
  indexId?: string;
  indexesTier: DataPackageDownloadTier;
  pathPrefixes?: string[];
}

export type DataPackageFileDefaults = Partial<Omit<DataPackageFile, "path" | "sha256" | "sizeBytes">>;

export interface DataPackageFileIndexContent {
  fileDefaults?: DataPackageFileDefaults;
  files?: Array<Partial<DataPackageFile> & Pick<DataPackageFile, "path" | "sha256" | "sizeBytes">>;
}

export interface DataPackageManifest {
  schemaVersion: string;
  dataVersion: string;
  generatedAt: string;
  gitCommit: string;
  minExtensionVersion: string;
  recommendedExtensionVersion: string;
  license: string;
  files: DataPackageFile[];
  fileIndexes?: DataPackageFileIndex[];
}

export interface DataPackageTierSummary {
  files: number;
  bytes: number;
}

export interface DataPackageManifestSummary {
  dataVersion: string;
  generatedAt: string;
  gitCommit: string;
  license: string;
  fileCount: number;
  totalBytes: number;
  requiredFiles: number;
  requiredBytes: number;
  byTier: Record<DataPackageDownloadTier, DataPackageTierSummary>;
  byCategory: Record<string, DataPackageTierSummary>;
}

export interface DataPackageVersionState {
  activeDataVersion?: string;
  previousDataVersion?: string;
  pendingDataVersion?: string;
  manifestUrl?: string;
  lastCheckedAt?: string;
  lastPulledAt?: string;
}

export interface AnalysisContext {
  userQuestion: string;
  match?: WorldCupMatch;
  matchCandidates?: MatchCandidateReport[];
  matchSelection?: MatchSelectionContext;
  pageContext?: Partial<PageContext>;
  dataSources: SourceMetadata[];
  recentEvents: string[];
  rosterNotes: string[];
  marketSignals: RankedMarket[];
  predictionMarketContext?: PredictionMarketContext;
  liveSportsContext?: LiveSportsContext;
  transcript?: string;
  frames?: string[];
  replayFrameTimeline?: ReplayFrameTimelineItem[];
}

export interface ReplayFrameTimelineItem {
  index: number;
  capturedAt: string;
}

export interface ChatConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExtensionMessage<TPayload = unknown> {
  type: string;
  payload?: TPayload;
}
