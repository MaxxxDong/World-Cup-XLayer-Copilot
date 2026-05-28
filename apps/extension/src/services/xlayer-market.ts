import type { MarketCandidate, WorldCupMatch } from "../shared/types";
import { readCache, writeCache } from "./cache";

const XLAYER_DAPP_BASE_URL = "http://kr.maxfugui.top/";
const XLAYER_REMOTE_MARKET_REGISTRY_URL = `${XLAYER_DAPP_BASE_URL}markets.json`;
const XLAYER_REMOTE_CHAMPION_REGISTRY_URL = `${XLAYER_DAPP_BASE_URL}champion-odds.json`;
const XLAYER_LOCAL_MARKET_REGISTRY_PATH = "xlayer-markets.json";
const XLAYER_LOCAL_CHAMPION_REGISTRY_PATH = "xlayer-champion.json";
const XLAYER_RPC_URLS = ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"];
const XLAYER_CHAIN_ID = 196;
const WORLD_CUP_TRI_MARKET_ADDRESS = "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3";
const GET_POOLS_SELECTOR = "0x62d26ed7";
const GET_ODDS_BPS_SELECTOR = "0xfb8a4d33";
const MARKET_REGISTRY_TTL_MS = 5 * 60 * 1000;
const MARKET_SNAPSHOT_TTL_MS = 15 * 1000;
const RPC_TIMEOUT_MS = 2500;
const USDT0_DECIMALS = 6;

type OutcomeIntent = "teamA" | "draw" | "teamB";

interface XLayerMarketRegistryItem {
  matchId: string;
  marketId?: string;
  officialMatchNumber?: number;
  teamA: string;
  teamB: string;
  group?: string;
  stage?: string;
  closeTimeUtc?: string;
  regularTimeOnly?: boolean;
  settlementSource?: string;
  contractAddress?: string;
  network?: string;
  chainId?: number;
  marketStatus?: "deployed" | "planned";
  referenceProbabilities?: Partial<Record<OutcomeIntent, number>>;
  referenceOddsBps?: Partial<Record<OutcomeIntent, number>>;
}

interface XLayerChampionReferenceItem {
  team: string;
  probability: number;
  oddsBps: number;
}

interface XLayerMarketSnapshot {
  teamAPool: bigint;
  teamBPool: bigint;
  drawPool: bigint;
  totalPool: bigint;
  teamAOddsBps: bigint;
  teamBOddsBps: bigint;
  drawOddsBps: bigint;
}

type SerializedXLayerMarketSnapshot = Record<keyof XLayerMarketSnapshot, string>;

export async function searchXLayerMarketsForMatch(match?: WorldCupMatch): Promise<MarketCandidate[]> {
  if (!match) return [];
  const [registry, championReferences] = await Promise.all([
    loadXLayerMarketRegistry(),
    loadXLayerChampionReferences()
  ]);
  const market = findRegistryMarket(match, registry);

  const snapshot = market?.marketId ? await loadXLayerMarketSnapshot(market).catch(() => undefined) : undefined;
  return [
    ...(market ? buildOutcomeCandidates(match, market, snapshot) : []),
    ...buildChampionCandidates(championReferences)
  ];
}

export function buildXLayerDappUrl(matchOrMarket?: WorldCupMatch | MarketCandidate, outcome?: OutcomeIntent): string {
  const url = new URL(XLAYER_DAPP_BASE_URL);
  const matchId = isMarketCandidate(matchOrMarket) ? matchOrMarket.slug : matchOrMarket?.id;
  const outcomeIntent = outcome ?? (isMarketCandidate(matchOrMarket) ? matchOrMarket.outcomeIntent : undefined);
  if (matchId) url.searchParams.set("matchId", matchId);
  if (outcomeIntent) url.searchParams.set("outcome", outcomeIntent);
  url.searchParams.set("source", "world-cup-copilot");
  return url.toString();
}

export function buildXLayerDappUrlForMarket(market: MarketCandidate): string {
  return buildXLayerDappUrl(market, market.outcomeIntent);
}

async function loadXLayerMarketRegistry(): Promise<XLayerMarketRegistryItem[]> {
  const cached = await readCache<XLayerMarketRegistryItem[]>("xlayer:market-registry");
  if (cached) return cached;
  const stale = await readCache<XLayerMarketRegistryItem[]>("xlayer:market-registry", { allowExpired: true });

  const urls = [XLAYER_REMOTE_MARKET_REGISTRY_URL, getLocalRegistryUrl()];
  for (const url of urls.filter(Boolean)) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const registry = normalizeRegistry(await response.json());
      await writeCache("xlayer:market-registry", registry, MARKET_REGISTRY_TTL_MS);
      return registry;
    } catch {
      // Try the next registry source.
    }
  }

  return stale ?? [];
}

async function loadXLayerChampionReferences(): Promise<XLayerChampionReferenceItem[]> {
  const cached = await readCache<XLayerChampionReferenceItem[]>("xlayer:champion-registry");
  if (cached) return cached;
  const stale = await readCache<XLayerChampionReferenceItem[]>("xlayer:champion-registry", { allowExpired: true });

  const urls = [XLAYER_REMOTE_CHAMPION_REGISTRY_URL, getLocalChampionRegistryUrl()];
  for (const url of urls.filter(Boolean)) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const registry = normalizeChampionReferences(await response.json());
      await writeCache("xlayer:champion-registry", registry, MARKET_REGISTRY_TTL_MS);
      return registry;
    } catch {
      // Try the next champion registry source.
    }
  }

  return stale ?? [];
}

async function loadXLayerMarketSnapshot(market: XLayerMarketRegistryItem): Promise<XLayerMarketSnapshot> {
  const marketId = BigInt(market.marketId ?? "0");
  const contractAddress = market.contractAddress ?? WORLD_CUP_TRI_MARKET_ADDRESS;
  const cacheKey = `xlayer:market-snapshot:${contractAddress.toLowerCase()}:${marketId.toString()}`;
  const cached = await readCache<SerializedXLayerMarketSnapshot>(cacheKey);
  if (cached) return deserializeSnapshot(cached);
  const stale = await readCache<SerializedXLayerMarketSnapshot>(cacheKey, { allowExpired: true });

  try {
    const [pools, odds] = await Promise.all([
      ethCallUintWords(contractAddress, encodeUint256Call(GET_POOLS_SELECTOR, marketId), 4),
      ethCallUintWords(contractAddress, encodeUint256Call(GET_ODDS_BPS_SELECTOR, marketId), 3)
    ]);
    const snapshot: XLayerMarketSnapshot = {
      teamAPool: pools[0] ?? 0n,
      teamBPool: pools[1] ?? 0n,
      drawPool: pools[2] ?? 0n,
      totalPool: pools[3] ?? 0n,
      teamAOddsBps: odds[0] ?? 0n,
      teamBOddsBps: odds[1] ?? 0n,
      drawOddsBps: odds[2] ?? 0n
    };
    await writeCache(cacheKey, serializeSnapshot(snapshot), MARKET_SNAPSHOT_TTL_MS);
    return snapshot;
  } catch (error) {
    if (stale) return deserializeSnapshot(stale);
    throw error;
  }
}

async function ethCallUintWords(contractAddress: string, data: string, wordCount: number): Promise<bigint[]> {
  let lastError: unknown;
  for (const rpcUrl of XLAYER_RPC_URLS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeout = controller ? setTimeout(() => controller.abort(), RPC_TIMEOUT_MS) : undefined;
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "eth_call",
          params: [{ to: contractAddress, data }, "latest"]
        }),
        signal: controller?.signal
      });
      if (!response.ok) throw new Error(`X Layer RPC HTTP ${response.status}`);
      const payload = (await response.json()) as { result?: string; error?: { message?: string } };
      if (payload.error) throw new Error(payload.error.message ?? "X Layer RPC error");
      if (!payload.result) throw new Error("X Layer RPC returned no result");
      return decodeUintWords(payload.result, wordCount);
    } catch (error) {
      lastError = error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("X Layer RPC unavailable");
}

function buildOutcomeCandidates(
  match: WorldCupMatch,
  market: XLayerMarketRegistryItem,
  snapshot?: XLayerMarketSnapshot
): MarketCandidate[] {
  return [
    buildOutcomeCandidate(match, market, "teamA", market.teamA, `${market.teamA} wins in regular time`, snapshot),
    buildOutcomeCandidate(match, market, "draw", "Draw", "Draw in regular time", snapshot),
    buildOutcomeCandidate(match, market, "teamB", market.teamB, `${market.teamB} wins in regular time`, snapshot)
  ];
}

function buildOutcomeCandidate(
  match: WorldCupMatch,
  market: XLayerMarketRegistryItem,
  outcomeIntent: OutcomeIntent,
  outcomeLabel: string,
  title: string,
  snapshot?: XLayerMarketSnapshot
): MarketCandidate {
  const pool = getOutcomePool(snapshot, outcomeIntent);
  const onChainOddsBps = getOutcomeOddsBps(snapshot, outcomeIntent);
  const totalPool = snapshot?.totalPool ?? 0n;
  const hasOnChainOdds = totalPool > 0n && onChainOddsBps > 0n;
  const reference = getReferenceOutcome(market, outcomeIntent);
  const poolAmountUsdt = formatUsdtNumber(pool);
  const totalPoolUsdt = formatUsdtNumber(totalPool);
  const payoutMultiple = hasOnChainOdds
    ? Number(onChainOddsBps) / 10_000
    : reference?.oddsBps
      ? reference.oddsBps / 10_000
      : undefined;
  const impliedProbability = hasOnChainOdds ? Number(pool) / Number(totalPool) : reference?.probability;
  const oddsSource: MarketCandidate["oddsSource"] = hasOnChainOdds ? "on-chain" : reference ? "reference" : undefined;
  const canOpenOrders = Boolean(market.marketId);

  return {
    id: `xlayer:${market.marketId ?? market.matchId}:${outcomeIntent}`,
    provider: "XLayer",
    marketId: market.marketId,
    outcomeIntent,
    oddsSource,
    contractAddress: market.contractAddress ?? WORLD_CUP_TRI_MARKET_ADDRESS,
    chainId: market.chainId ?? XLAYER_CHAIN_ID,
    slug: market.matchId,
    eventSlug: `${market.matchId}:${outcomeIntent}`,
    eventTitle: `${market.teamA} vs ${market.teamB}`,
    title,
    description: [
      `${market.teamA} vs ${market.teamB}`,
      market.group,
      market.stage,
      hasOnChainOdds ? "X Layer USDT0 pool-implied odds" : "Reference odds before X Layer liquidity",
      market.regularTimeOnly ? "regular time only" : undefined,
      `Outcome: ${outcomeLabel}`
    ].filter(Boolean).join(" · "),
    active: true,
    closed: false,
    acceptingOrders: canOpenOrders,
    enableOrderBook: canOpenOrders,
    outcomes: ["Team A", "Draw", "Team B"],
    yesPrice: impliedProbability,
    referenceProbability: oddsSource === "reference" ? impliedProbability : undefined,
    liquidity: totalPoolUsdt,
    volume: totalPoolUsdt,
    poolAmountUsdt,
    totalPoolUsdt,
    payoutMultiple,
    closeTimeUtc: market.closeTimeUtc ?? match.kickoffUtc,
    settlementSource: market.settlementSource ?? "FIFA official result",
    officialUrl: buildXLayerDappUrlForMatchId(market.matchId, outcomeIntent)
  };
}

function buildChampionCandidates(references: XLayerChampionReferenceItem[]): MarketCandidate[] {
  return references.slice(0, 12).map((reference) => ({
    id: `xlayer:champion:${normalizeComparableText(reference.team).replace(/\s+/g, "-")}`,
    provider: "XLayer",
    oddsSource: "reference",
    slug: `champion:${reference.team}`,
    eventSlug: "2026-world-cup-champion-reference",
    eventTitle: "2026 World Cup champion",
    title: `${reference.team} wins 2026 World Cup`,
    description: "World Cup champion reference odds · X Layer champion trading is a separate contract phase",
    active: true,
    closed: false,
    acceptingOrders: false,
    enableOrderBook: false,
    outcomes: ["Yes", "No"],
    yesPrice: reference.probability,
    referenceProbability: reference.probability,
    payoutMultiple: reference.oddsBps / 10_000,
    officialUrl: buildXLayerChampionDappUrl(reference.team)
  }));
}

function findRegistryMarket(match: WorldCupMatch, registry: XLayerMarketRegistryItem[]): XLayerMarketRegistryItem | undefined {
  return (
    registry.find((market) => market.matchId === match.id) ??
    registry.find((market) => sameTeams(market, match))
  );
}

function sameTeams(market: XLayerMarketRegistryItem, match: WorldCupMatch): boolean {
  const marketTeams = [market.teamA, market.teamB].map(normalizeComparableText).sort().join("|");
  const matchTeams = [match.team1, match.team2].map(normalizeComparableText).sort().join("|");
  return marketTeams === matchTeams;
}

function normalizeRegistry(value: unknown): XLayerMarketRegistryItem[] {
  return Array.isArray(value)
    ? value
        .map((item) => item as Partial<XLayerMarketRegistryItem>)
        .filter((item) => item.matchId && item.teamA && item.teamB)
        .map((item) => ({
          ...item,
          matchId: String(item.matchId),
          marketId: item.marketId === undefined ? undefined : String(item.marketId),
          teamA: String(item.teamA),
          teamB: String(item.teamB),
          contractAddress: item.contractAddress ?? WORLD_CUP_TRI_MARKET_ADDRESS,
          chainId: item.chainId ?? XLAYER_CHAIN_ID,
          referenceProbabilities: normalizeReferenceRecord(item.referenceProbabilities),
          referenceOddsBps: normalizeReferenceRecord(item.referenceOddsBps)
        }))
    : [];
}

function normalizeChampionReferences(value: unknown): XLayerChampionReferenceItem[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { entries?: unknown[] }).entries)
      ? (value as { entries: unknown[] }).entries
      : [];

  return entries
    .map((item) => item as Partial<XLayerChampionReferenceItem>)
    .filter((item) => item.team && Number.isFinite(Number(item.probability)) && Number.isFinite(Number(item.oddsBps)))
    .map((item) => ({
      team: String(item.team),
      probability: Number(item.probability),
      oddsBps: Number(item.oddsBps)
    }));
}

function normalizeReferenceRecord(value: unknown): Partial<Record<OutcomeIntent, number>> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<Record<OutcomeIntent, unknown>>;
  return {
    teamA: numberOrUndefined(record.teamA),
    draw: numberOrUndefined(record.draw),
    teamB: numberOrUndefined(record.teamB)
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getLocalRegistryUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(XLAYER_LOCAL_MARKET_REGISTRY_PATH);
  }
  return `/${XLAYER_LOCAL_MARKET_REGISTRY_PATH}`;
}

function getLocalChampionRegistryUrl(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(XLAYER_LOCAL_CHAMPION_REGISTRY_PATH);
  }
  return `/${XLAYER_LOCAL_CHAMPION_REGISTRY_PATH}`;
}

function encodeUint256Call(selector: string, value: bigint): string {
  return `${selector}${value.toString(16).padStart(64, "0")}`;
}

function decodeUintWords(hex: string, wordCount: number): bigint[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const values: bigint[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    const word = clean.slice(index * 64, (index + 1) * 64);
    values.push(word ? BigInt(`0x${word}`) : 0n);
  }
  return values;
}

function getOutcomePool(snapshot: XLayerMarketSnapshot | undefined, outcome: OutcomeIntent): bigint {
  if (!snapshot) return 0n;
  if (outcome === "teamA") return snapshot.teamAPool;
  if (outcome === "teamB") return snapshot.teamBPool;
  return snapshot.drawPool;
}

function getOutcomeOddsBps(snapshot: XLayerMarketSnapshot | undefined, outcome: OutcomeIntent): bigint {
  if (!snapshot) return 0n;
  if (outcome === "teamA") return snapshot.teamAOddsBps;
  if (outcome === "teamB") return snapshot.teamBOddsBps;
  return snapshot.drawOddsBps;
}

function getReferenceOutcome(
  market: XLayerMarketRegistryItem,
  outcome: OutcomeIntent
): { probability?: number; oddsBps?: number } | undefined {
  const probability = market.referenceProbabilities?.[outcome];
  const oddsBps = market.referenceOddsBps?.[outcome];
  if (probability === undefined && oddsBps === undefined) return undefined;
  return { probability, oddsBps };
}

function formatUsdtNumber(value: bigint): number | undefined {
  if (value <= 0n) return undefined;
  return Number(value) / 10 ** USDT0_DECIMALS;
}

function normalizeComparableText(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized === "usa" || normalized === "u s" || normalized === "u s a" || normalized === "usmnt") {
    return "united states";
  }
  return normalized;
}

function isMarketCandidate(value?: WorldCupMatch | MarketCandidate): value is MarketCandidate {
  return Boolean(value && "officialUrl" in value);
}

function buildXLayerDappUrlForMatchId(matchId: string, outcome?: OutcomeIntent): string {
  const url = new URL(XLAYER_DAPP_BASE_URL);
  url.searchParams.set("matchId", matchId);
  if (outcome) url.searchParams.set("outcome", outcome);
  url.searchParams.set("source", "world-cup-copilot");
  return url.toString();
}

function buildXLayerChampionDappUrl(team: string): string {
  const url = new URL(XLAYER_DAPP_BASE_URL);
  url.searchParams.set("view", "champion");
  url.searchParams.set("team", team);
  url.searchParams.set("source", "world-cup-copilot");
  return url.toString();
}

function serializeSnapshot(snapshot: XLayerMarketSnapshot): SerializedXLayerMarketSnapshot {
  return {
    teamAPool: snapshot.teamAPool.toString(),
    teamBPool: snapshot.teamBPool.toString(),
    drawPool: snapshot.drawPool.toString(),
    totalPool: snapshot.totalPool.toString(),
    teamAOddsBps: snapshot.teamAOddsBps.toString(),
    teamBOddsBps: snapshot.teamBOddsBps.toString(),
    drawOddsBps: snapshot.drawOddsBps.toString()
  };
}

function deserializeSnapshot(snapshot: SerializedXLayerMarketSnapshot): XLayerMarketSnapshot {
  return {
    teamAPool: BigInt(snapshot.teamAPool),
    teamBPool: BigInt(snapshot.teamBPool),
    drawPool: BigInt(snapshot.drawPool),
    totalPool: BigInt(snapshot.totalPool),
    teamAOddsBps: BigInt(snapshot.teamAOddsBps),
    teamBOddsBps: BigInt(snapshot.teamBOddsBps),
    drawOddsBps: BigInt(snapshot.drawOddsBps)
  };
}
