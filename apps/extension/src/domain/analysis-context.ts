import type {
  AnalysisContext,
  LiveSportsContext,
  LiveSportsSignal,
  MatchCandidateReport,
  MatchDetectionResult,
  PageContext,
  PredictionMarketContext,
  PredictionMarketSignal,
  RankedMarket,
  SourceMetadata,
  SportsDataSnapshot
} from "../shared/types";

export function buildAnalysisContext(input: {
  question: string;
  detection?: MatchDetectionResult;
  matchCandidates?: MatchCandidateReport[];
  manualMatchId?: string;
  pageContext?: Partial<PageContext>;
  markets: RankedMarket[];
  extraSources?: SourceMetadata[];
  recentEvents?: string[];
  rosterNotes?: string[];
  sportsSnapshots?: SportsDataSnapshot[];
  transcript?: string;
  frames?: string[];
  replayFrameTimeline?: AnalysisContext["replayFrameTimeline"];
}): AnalysisContext {
  const sources = new Map<string, SourceMetadata>();

  if (input.detection?.match.source) {
    sources.set(input.detection.match.source.sourceName, input.detection.match.source);
  }

  for (const source of input.extraSources ?? []) {
    sources.set(source.sourceName, source);
  }

  for (const snapshot of input.sportsSnapshots ?? []) {
    if (snapshot.source) sources.set(snapshot.source.sourceName, snapshot.source);
  }

  return {
    userQuestion: input.question,
    match: input.detection?.match,
    matchCandidates: (input.matchCandidates ?? []).slice(0, 3),
    matchSelection: {
      matchId: input.detection?.match.id,
      mode: input.manualMatchId ? "manual" : input.detection ? "auto" : "none",
    },
    pageContext: input.pageContext,
    dataSources: Array.from(sources.values()),
    recentEvents: input.recentEvents ?? [],
    rosterNotes: input.rosterNotes ?? [],
    marketSignals: input.markets.slice(0, 8),
    predictionMarketContext: buildPredictionMarketContext(input.markets),
    liveSportsContext: buildLiveSportsContext(input.sportsSnapshots ?? []),
    transcript: input.transcript,
    frames: input.frames,
    replayFrameTimeline: input.replayFrameTimeline
  };
}

function buildPredictionMarketContext(markets: RankedMarket[]): PredictionMarketContext {
  return {
    provider: "XLayer",
    sourceName: "X Layer WorldCupTriMarket contract",
    sourceUrl: "https://www.okx.com/web3/explorer/xlayer/address/0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
    dataRole: "X Layer USDT0 pool-implied odds and liquidity signal for analysis, not betting instructions.",
    marketCount: markets.length,
    topSignals: markets.slice(0, 6).map(toPredictionMarketSignal)
  };
}

function toPredictionMarketSignal(market: RankedMarket): PredictionMarketSignal {
  return {
    id: market.id,
    provider: market.provider,
    marketId: market.marketId,
    outcomeIntent: market.outcomeIntent,
    oddsSource: market.oddsSource,
    contractAddress: market.contractAddress,
    chainId: market.chainId,
    title: market.title,
    eventTitle: market.eventTitle,
    group: market.group,
    relevanceScore: market.relevanceScore,
    relevanceReason: market.relevanceReason,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    liquidity: market.liquidity,
    volume: market.volume,
    poolAmountUsdt: market.poolAmountUsdt,
    totalPoolUsdt: market.totalPoolUsdt,
    payoutMultiple: market.payoutMultiple,
    referenceProbability: market.referenceProbability,
    priceChange: market.priceChange,
    acceptingOrders: market.acceptingOrders,
    officialUrl: market.officialUrl
  };
}

function buildLiveSportsContext(snapshots: SportsDataSnapshot[]): LiveSportsContext | undefined {
  if (!snapshots.length) return undefined;
  return {
    dataRole: "User-key sports API snapshot for live status, schedule, and score analysis.",
    snapshots: snapshots.map(toLiveSportsSignal)
  };
}

function toLiveSportsSignal(snapshot: SportsDataSnapshot): LiveSportsSignal {
  const signal: LiveSportsSignal = {
    provider: snapshot.provider,
    status: snapshot.status,
    message: snapshot.message,
    eventCount: snapshot.events.length,
    events: snapshot.events.slice(0, 5),
    fixtures: (snapshot.fixtures ?? []).slice(0, 5)
  };
  if (snapshot.source?.sourceName) signal.sourceName = snapshot.source.sourceName;
  if (snapshot.source?.sourceUrl) signal.sourceUrl = snapshot.source.sourceUrl;
  return signal;
}
