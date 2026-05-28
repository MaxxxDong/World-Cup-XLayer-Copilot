import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider
} from "viem";
import { xLayerMainnet, xLayerUsdtAddress } from "./config/xlayer";
import "./styles.css";

const marketAbi = [
  {
    type: "function",
    name: "getPools",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "teamAPool", type: "uint256" },
      { name: "teamBPool", type: "uint256" },
      { name: "drawPool", type: "uint256" },
      { name: "totalPool", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "getOddsBps",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "teamAOddsBps", type: "uint256" },
      { name: "teamBOddsBps", type: "uint256" },
      { name: "drawOddsBps", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "matchId", type: "string" },
      { name: "teamA", type: "string" },
      { name: "teamB", type: "string" },
      { name: "closeTime", type: "uint256" },
      { name: "maxTotalPool", type: "uint256" },
      { name: "maxUserStake", type: "uint256" },
      { name: "totalPool", type: "uint256" },
      { name: "closed", type: "bool" },
      { name: "exists", type: "bool" },
      { name: "resolvedOutcome", type: "uint8" },
      { name: "teamAPool", type: "uint256" },
      { name: "teamBPool", type: "uint256" },
      { name: "drawPool", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "userOutcomeStake",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "user", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "userTotalStake",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: []
  }
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

type MarketSeed = {
  matchId: string;
  marketId?: string;
  marketStatus?: "deployed" | "planned";
  officialMatchNumber?: number;
  teamA: string;
  teamB: string;
  group?: string;
  stage?: string;
  closeTimeUtc?: string;
  settlementSource?: string;
  polymarketQuery?: string;
  contractAddress?: string;
  referenceProbabilities?: Partial<Record<OutcomeIntent, number>>;
  referenceOddsBps?: Partial<Record<OutcomeIntent, number>>;
  referenceOddsSource?: {
    provider?: string;
    sourceUrl?: string;
    updatedAt?: string;
    method?: string;
  };
};

type MarketSnapshot = {
  teamAPool: bigint;
  teamBPool: bigint;
  drawPool: bigint;
  totalPool: bigint;
  teamAOddsBps: bigint;
  teamBOddsBps: bigint;
  drawOddsBps: bigint;
  closeTime: bigint;
  maxTotalPool: bigint;
  maxUserStake: bigint;
  closed: boolean;
  exists: boolean;
  resolvedOutcome: number;
  userTeamAStake: bigint;
  userTeamBStake: bigint;
  userDrawStake: bigint;
  userTotalStake: bigint;
  userClaimed: boolean;
};

type PolymarketReference = {
  question: string;
  slug?: string;
  liquidity?: string;
  volume?: string;
  outcomes: { name: string; price?: string }[];
};

type ChampionReference = {
  team: string;
  probability: number;
  oddsBps: number;
  question?: string;
  slug?: string;
  volume?: number;
  liquidity?: number;
  updatedAt?: string;
};

const publicClient = createPublicClient({
  chain: xLayerMainnet,
  transport: http()
});

const contractAddress = (import.meta.env.VITE_WORLD_CUP_TRI_MARKET_ADDRESS || "") as Address | "";
const configuredRegistryUrl = import.meta.env.VITE_MARKET_REGISTRY_URL || "/markets.json";
const configuredChampionReferenceUrl = import.meta.env.VITE_CHAMPION_REFERENCE_URL || "/champion-odds.json";

const fallbackMatches: MarketSeed[] = [
  {
    matchId: "wc-2026-001-mex-rsa",
    teamA: "Mexico",
    teamB: "South Africa",
    group: "Group A",
    stage: "Matchday 1",
    closeTimeUtc: "2026-06-11T19:00:00.000Z",
    settlementSource: "FIFA official result",
    polymarketQuery: "Mexico South Africa 2026 World Cup"
  },
  {
    matchId: "wc-2026-007-canada-bosnia-and-herzegovina",
    teamA: "Canada",
    teamB: "Bosnia & Herzegovina",
    group: "Group B",
    stage: "Matchday 2",
    closeTimeUtc: "2026-06-12T19:00:00.000Z",
    settlementSource: "FIFA official result",
    polymarketQuery: "Canada Bosnia & Herzegovina 2026 World Cup"
  }
];

const outcomeLabels: Record<number, string> = {
  1: "Team A",
  2: "Team B",
  3: "Draw",
  4: "Void"
};

type OutcomeIntent = "teamA" | "teamB" | "draw";

const outcomeIntentLabels: Record<OutcomeIntent, string> = {
  teamA: "Team A",
  teamB: "Team B",
  draw: "Draw"
};

const outcomeIntentToContractOutcome: Record<OutcomeIntent, 1 | 2 | 3> = {
  teamA: 1,
  teamB: 2,
  draw: 3
};

function parseOutcomeIntent(value: string | null): OutcomeIntent | null {
  if (value === "teamA" || value === "teamB" || value === "draw") return value;
  return null;
}

function getEthereum() {
  return (window as Window & { ethereum?: EIP1193Provider }).ethereum;
}

function formatToken(value?: bigint) {
  if (value === undefined) return "--";
  const raw = formatUnits(value, 6);
  const [whole, fraction = ""] = raw.split(".");
  const trimmed = fraction.slice(0, 2).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function formatOdds(oddsBps?: bigint) {
  if (!oddsBps || oddsBps === 0n) return "--";
  return `${(Number(oddsBps) / 10_000).toFixed(2)}x`;
}

function formatOddsBps(oddsBps?: bigint | number) {
  if (!oddsBps || Number(oddsBps) === 0) return "--";
  return `${(Number(oddsBps) / 10_000).toFixed(2)}x`;
}

function formatProbability(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 1000) / 10}%`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseMaybeAddress(value: string): Address | "" {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : "";
}

function parseGammaList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

function relevanceScore(text: string, match: MarketSeed) {
  const normalized = text.toLowerCase();
  const terms = [match.teamA, match.teamB, "world cup"].map((term) => term.toLowerCase());
  return terms.reduce((score, term) => (normalized.includes(term) ? score + 1 : score), 0);
}

async function fetchPolymarketReferences(match: MarketSeed): Promise<PolymarketReference[]> {
  const query = match.polymarketQuery || `${match.teamA} ${match.teamB} World Cup`;
  const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20&search=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Polymarket Gamma HTTP ${response.status}`);
  const markets = (await response.json()) as {
    question?: string;
    slug?: string;
    liquidity?: string;
    volume?: string;
    outcomes?: unknown;
    outcomePrices?: unknown;
  }[];

  return markets
    .map((market) => {
      const outcomes = parseGammaList(market.outcomes);
      const prices = parseGammaList(market.outcomePrices);
      return {
        question: market.question ?? "Untitled Polymarket market",
        slug: market.slug,
        liquidity: market.liquidity,
        volume: market.volume,
        outcomes: outcomes.map((name, index) => ({ name, price: prices[index] }))
      };
    })
    .filter((market) => relevanceScore(`${market.question} ${market.slug ?? ""}`, match) >= 2)
    .slice(0, 3);
}

async function loadRegistry(): Promise<MarketSeed[]> {
  try {
    const response = await fetch(configuredRegistryUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { markets?: MarketSeed[] } | MarketSeed[];
    if (Array.isArray(payload)) return payload;
    if (payload.markets?.length) return payload.markets;
  } catch {
    return fallbackMatches;
  }
  return fallbackMatches;
}

async function loadChampionReferences(): Promise<ChampionReference[]> {
  try {
    const response = await fetch(configuredChampionReferenceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { entries?: ChampionReference[] } | ChampionReference[];
    return Array.isArray(payload) ? payload : payload.entries ?? [];
  } catch {
    return [];
  }
}

function getOutcomeDisplay(match: MarketSeed | undefined, snapshot: MarketSnapshot | null, intent: OutcomeIntent) {
  const pool = getOutcomePool(snapshot, intent);
  const onChainOdds = getOutcomeOdds(snapshot, intent);
  const hasOnChainOdds = Boolean(snapshot && snapshot.totalPool > 0n && onChainOdds > 0n);
  const referenceOdds = match?.referenceOddsBps?.[intent];
  const referenceProbability = match?.referenceProbabilities?.[intent];
  return {
    pool,
    oddsLabel: hasOnChainOdds ? formatOddsBps(onChainOdds) : formatOddsBps(referenceOdds),
    oddsSource: hasOnChainOdds ? "On-chain" : referenceOdds ? "Reference" : "Unavailable",
    probabilityLabel: hasOnChainOdds && snapshot ? formatProbability(Number(pool) / Number(snapshot.totalPool)) : formatProbability(referenceProbability)
  };
}

function getOutcomePool(snapshot: MarketSnapshot | null, intent: OutcomeIntent): bigint | undefined {
  if (!snapshot) return undefined;
  if (intent === "teamA") return snapshot.teamAPool;
  if (intent === "teamB") return snapshot.teamBPool;
  return snapshot.drawPool;
}

function getOutcomeOdds(snapshot: MarketSnapshot | null, intent: OutcomeIntent): bigint {
  if (!snapshot) return 0n;
  if (intent === "teamA") return snapshot.teamAOddsBps;
  if (intent === "teamB") return snapshot.teamBOddsBps;
  return snapshot.drawOddsBps;
}

function App() {
  const [matches, setMatches] = useState<MarketSeed[]>(fallbackMatches);
  const [selectedMatchId, setSelectedMatchId] = useState(fallbackMatches[0].matchId);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [amount, setAmount] = useState("1");
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [status, setStatus] = useState("Ready");
  const [polymarketStatus, setPolymarketStatus] = useState("Reference not loaded");
  const [polymarketRefs, setPolymarketRefs] = useState<PolymarketReference[]>([]);
  const [championRefs, setChampionRefs] = useState<ChampionReference[]>([]);
  const [selectedChampionTeam, setSelectedChampionTeam] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [manualContractAddress, setManualContractAddress] = useState<string>(contractAddress);
  const [selectedOutcomeIntent, setSelectedOutcomeIntent] = useState<OutcomeIntent | null>(null);

  const selectedMatch = matches.find((match) => match.matchId === selectedMatchId) ?? matches[0];
  const selectedChampion =
    championRefs.find((entry) => entry.team === selectedChampionTeam) ?? championRefs[0];
  const activeContractAddress =
    parseMaybeAddress(manualContractAddress) || parseMaybeAddress(selectedMatch?.contractAddress ?? "");
  const marketId = selectedMatch?.marketId ? BigInt(selectedMatch.marketId) : null;
  const selectedAmount = useMemo(() => {
    try {
      return parseUnits(amount || "0", 6);
    } catch {
      return 0n;
    }
  }, [amount]);
  const needsApproval = Boolean(activeContractAddress && account && selectedAmount > 0n && (allowance ?? 0n) < selectedAmount);
  const isCorrectChain = chainId === xLayerMainnet.id;
  const canTrade = Boolean(activeContractAddress && marketId && account && isCorrectChain && snapshot?.exists && !snapshot.closed && snapshot.resolvedOutcome === 0);
  const marketIsPlanned = Boolean(selectedMatch && !selectedMatch.marketId);
  const referenceUpdatedAt = selectedMatch?.referenceOddsSource?.updatedAt
    ? new Date(selectedMatch.referenceOddsSource.updatedAt).toLocaleString()
    : undefined;

  async function refresh(address = account) {
    if (!activeContractAddress || !marketId) {
      setSnapshot(null);
      setAllowance(null);
      setBalance(null);
      return;
    }

    const [pools, odds, marketState] = await Promise.all([
      publicClient.readContract({
        address: activeContractAddress,
        abi: marketAbi,
        functionName: "getPools",
        args: [marketId]
      }),
      publicClient.readContract({
        address: activeContractAddress,
        abi: marketAbi,
        functionName: "getOddsBps",
        args: [marketId]
      }),
      publicClient.readContract({
        address: activeContractAddress,
        abi: marketAbi,
        functionName: "markets",
        args: [marketId]
      })
    ]);

    let userTeamAStake = 0n;
    let userTeamBStake = 0n;
    let userDrawStake = 0n;
    let userTotalStake = 0n;
    let userClaimed = false;

    if (address) {
      const userReads = await Promise.all([
        publicClient.readContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "userOutcomeStake",
          args: [marketId, 1, address]
        }),
        publicClient.readContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "userOutcomeStake",
          args: [marketId, 2, address]
        }),
        publicClient.readContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "userOutcomeStake",
          args: [marketId, 3, address]
        }),
        publicClient.readContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "userTotalStake",
          args: [marketId, address]
        }),
        publicClient.readContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "claimed",
          args: [marketId, address]
        }),
        publicClient.readContract({
          address: xLayerUsdtAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address]
        }),
        publicClient.readContract({
          address: xLayerUsdtAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, activeContractAddress]
        })
      ]);
      [userTeamAStake, userTeamBStake, userDrawStake, userTotalStake, userClaimed] = userReads.slice(0, 5) as [
        bigint,
        bigint,
        bigint,
        bigint,
        boolean
      ];
      setBalance(userReads[5] as bigint);
      setAllowance(userReads[6] as bigint);
    }

    setSnapshot({
      teamAPool: pools[0],
      teamBPool: pools[1],
      drawPool: pools[2],
      totalPool: pools[3],
      teamAOddsBps: odds[0],
      teamBOddsBps: odds[1],
      drawOddsBps: odds[2],
      closeTime: marketState[3],
      maxTotalPool: marketState[4],
      maxUserStake: marketState[5],
      closed: marketState[7],
      exists: marketState[8],
      resolvedOutcome: marketState[9],
      userTeamAStake,
      userTeamBStake,
      userDrawStake,
      userTotalStake,
      userClaimed
    });
  }

  async function refreshPolymarket(match = selectedMatch) {
    if (!match) return;
    setPolymarketStatus("Loading Polymarket reference...");
    try {
      const refs = await fetchPolymarketReferences(match);
      setPolymarketRefs(refs);
      setPolymarketStatus(refs.length ? "Reference loaded" : "No reliable related Polymarket market found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPolymarketRefs([]);
      setPolymarketStatus(message.slice(0, 180));
    }
  }

  async function connectWallet() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus("No EIP-1193 wallet found. Install OKX Wallet or another X Layer compatible wallet.");
      return;
    }

    const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
    const walletChainId = Number(await ethereum.request({ method: "eth_chainId" }));
    setAccount(accounts[0]);
    setChainId(walletChainId);
    setStatus(`Wallet connected: ${shortAddress(accounts[0])}`);
    await refresh(accounts[0]);
  }

  async function switchToXLayer() {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xc4" }]
      });
    } catch {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xc4",
            chainName: xLayerMainnet.name,
            nativeCurrency: xLayerMainnet.nativeCurrency,
            rpcUrls: xLayerMainnet.rpcUrls.default.http,
            blockExplorerUrls: [xLayerMainnet.blockExplorers.default.url]
          }
        ]
      });
    }
    setChainId(xLayerMainnet.id);
    setStatus("Switched to X Layer mainnet.");
  }

  async function sendTx(action: "approve" | "buy" | "claim", outcome?: number) {
    const ethereum = getEthereum();
    if (!ethereum || !account || !activeContractAddress) return;
    if (action === "buy" && !marketId) return;

    const walletClient = createWalletClient({
      account,
      chain: xLayerMainnet,
      transport: custom(ethereum)
    });

    setIsBusy(true);
    try {
      if (action === "approve") {
        setStatus("Sending USDT0 approve transaction...");
        const txHash = await walletClient.writeContract({
          address: xLayerUsdtAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [activeContractAddress, selectedAmount]
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setStatus(`Approve confirmed: ${txHash}`);
      }

      if (action === "buy" && marketId && outcome) {
        setStatus(`Buying ${outcomeLabels[outcome]} with ${amount} USDT0...`);
        const txHash = await walletClient.writeContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "buy",
          args: [marketId, outcome, selectedAmount]
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setStatus(`Buy confirmed: ${txHash}`);
      }

      if (action === "claim" && marketId) {
        setStatus("Sending claim transaction...");
        const txHash = await walletClient.writeContract({
          address: activeContractAddress,
          abi: marketAbi,
          functionName: "claim",
          args: [marketId]
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setStatus(`Claim confirmed: ${txHash}`);
      }

      await refresh(account);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message.slice(0, 280));
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadRegistry().then((loaded) => {
      setMatches(loaded);
      const query = new URLSearchParams(window.location.search);
      const requestedMatchId = query.get("matchId");
      const requestedOutcome = parseOutcomeIntent(query.get("outcome"));
      const nextSelected = loaded.find((match) => match.matchId === requestedMatchId)?.matchId ?? loaded[0]?.matchId;
      if (nextSelected) setSelectedMatchId(nextSelected);
      if (requestedOutcome) {
        setSelectedOutcomeIntent(requestedOutcome);
        setStatus(`Loaded ${outcomeIntentLabels[requestedOutcome]} trade intent from extension.`);
      }
      const registryContract = loaded.find((match) => match.matchId === nextSelected)?.contractAddress ?? loaded[0]?.contractAddress;
      if (!manualContractAddress && registryContract) setManualContractAddress(registryContract);
    });
    void loadChampionReferences().then((loaded) => {
      setChampionRefs(loaded);
      const requestedTeam = new URLSearchParams(window.location.search).get("team");
      const nextTeam = loaded.find((entry) => entry.team === requestedTeam)?.team ?? loaded[0]?.team;
      if (nextTeam) setSelectedChampionTeam(nextTeam);
    });
  }, []);

  useEffect(() => {
    if (!activeContractAddress || !marketId) return;
    void refresh();
  }, [activeContractAddress, marketId]);

  useEffect(() => {
    if (!selectedMatch) return;
    void refreshPolymarket(selectedMatch);
  }, [selectedMatchId, matches]);

  const handoffUrl = `${window.location.origin}${window.location.pathname}?matchId=${encodeURIComponent(selectedMatch?.matchId ?? "")}`;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <span>X Layer mainnet · USDT0 pari-mutuel pool</span>
          <h1>World-Cup-XLayer-Copilot</h1>
          <p>
            Three outcomes, real USDT0, on-chain pool-implied odds. Polymarket can be shown as reference later,
            but every trade here settles against the X Layer contract.
          </p>
        </div>
        <div className="status-card">
          <strong>{account ? shortAddress(account) : "Wallet not connected"}</strong>
          <span>{isCorrectChain ? "X Layer ready" : `Chain: ${chainId ?? "unknown"}`}</span>
          <div className="status-actions">
            <button type="button" onClick={connectWallet}>
              Connect
            </button>
            <button type="button" onClick={switchToXLayer}>
              X Layer
            </button>
          </div>
        </div>
      </section>

      <section className="control-strip">
        <label>
          Contract
          <input
            value={manualContractAddress}
            onChange={(event) => setManualContractAddress(event.target.value)}
            placeholder="0x... deployed WorldCupTriMarket"
          />
        </label>
        <label>
          Match
          <select
            value={selectedMatchId}
            onChange={(event) => {
              setSelectedMatchId(event.target.value);
              setSelectedOutcomeIntent(null);
            }}
          >
            {matches.map((match) => (
              <option key={match.matchId} value={match.matchId}>
                {match.teamA} vs {match.teamB}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => refresh()} disabled={!activeContractAddress || !marketId}>
          Refresh
        </button>
      </section>

      <section className="risk-panel">
        <strong>Live mainnet MVP</strong>
        <span>
          Uses real USDT0 with capped pools. Settlement is manual for this hackathon build and follows FIFA official
          regular-time results. Polymarket is an external reference only, not the source of payouts or settlement.
        </span>
      </section>

      <section className="market-layout">
        <article className="market-panel">
          <div className="market-heading">
            <span>
              {selectedMatch?.group ?? "World Cup"} · {selectedMatch?.stage ?? "Match"}
            </span>
            <h2>
              {selectedMatch?.teamA} vs {selectedMatch?.teamB}
            </h2>
            <p>{selectedMatch?.settlementSource ?? "FIFA official result"} · regular time only</p>
          </div>

          <div className="metrics">
            <Metric label={`${selectedMatch?.teamA} pool`} value={`${formatToken(snapshot?.teamAPool)} USDT0`} />
            <Metric label="Draw pool" value={`${formatToken(snapshot?.drawPool)} USDT0`} />
            <Metric label={`${selectedMatch?.teamB} pool`} value={`${formatToken(snapshot?.teamBPool)} USDT0`} />
            <Metric label="Total pool" value={`${formatToken(snapshot?.totalPool)} / ${formatToken(snapshot?.maxTotalPool)} USDT0`} />
          </div>
          {snapshot?.totalPool === 0n || marketIsPlanned ? (
            <p className="intent-note">
              {marketIsPlanned
                ? "This fixture is listed with reference odds and is not deployed on X Layer yet."
                : "Pool is empty, so the displayed outcome odds are reference odds until real USDT0 liquidity exists."}
              {referenceUpdatedAt ? ` Updated ${referenceUpdatedAt}.` : ""}
            </p>
          ) : null}

          <div className="buy-box">
            <label>
              Amount
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>
            <button type="button" disabled={!account || !activeContractAddress || selectedAmount <= 0n || isBusy} onClick={() => sendTx("approve")}>
              {needsApproval ? "Approve USDT0" : "Refresh approval"}
            </button>
          </div>

          <div className="outcome-grid">
            <OutcomeButton
              label={`${selectedMatch?.teamA} wins`}
              pool={getOutcomeDisplay(selectedMatch, snapshot, "teamA").pool}
              oddsLabel={getOutcomeDisplay(selectedMatch, snapshot, "teamA").oddsLabel}
              oddsSource={getOutcomeDisplay(selectedMatch, snapshot, "teamA").oddsSource}
              probabilityLabel={getOutcomeDisplay(selectedMatch, snapshot, "teamA").probabilityLabel}
              selected={selectedOutcomeIntent === "teamA"}
              disabled={!canTrade || needsApproval || isBusy}
              onClick={() => {
                setSelectedOutcomeIntent("teamA");
                void sendTx("buy", outcomeIntentToContractOutcome.teamA);
              }}
            />
            <OutcomeButton
              label="Draw"
              pool={getOutcomeDisplay(selectedMatch, snapshot, "draw").pool}
              oddsLabel={getOutcomeDisplay(selectedMatch, snapshot, "draw").oddsLabel}
              oddsSource={getOutcomeDisplay(selectedMatch, snapshot, "draw").oddsSource}
              probabilityLabel={getOutcomeDisplay(selectedMatch, snapshot, "draw").probabilityLabel}
              selected={selectedOutcomeIntent === "draw"}
              disabled={!canTrade || needsApproval || isBusy}
              onClick={() => {
                setSelectedOutcomeIntent("draw");
                void sendTx("buy", outcomeIntentToContractOutcome.draw);
              }}
            />
            <OutcomeButton
              label={`${selectedMatch?.teamB} wins`}
              pool={getOutcomeDisplay(selectedMatch, snapshot, "teamB").pool}
              oddsLabel={getOutcomeDisplay(selectedMatch, snapshot, "teamB").oddsLabel}
              oddsSource={getOutcomeDisplay(selectedMatch, snapshot, "teamB").oddsSource}
              probabilityLabel={getOutcomeDisplay(selectedMatch, snapshot, "teamB").probabilityLabel}
              selected={selectedOutcomeIntent === "teamB"}
              disabled={!canTrade || needsApproval || isBusy}
              onClick={() => {
                setSelectedOutcomeIntent("teamB");
                void sendTx("buy", outcomeIntentToContractOutcome.teamB);
              }}
            />
          </div>
          {selectedOutcomeIntent ? (
            <p className="intent-note">
              Selected intent: {outcomeIntentLabels[selectedOutcomeIntent]}. Review amount, approval, and wallet prompt before signing.
            </p>
          ) : null}
        </article>

        <aside className="side-panel">
          <h3>Position</h3>
          <dl>
            <div>
              <dt>Balance</dt>
              <dd>{formatToken(balance ?? undefined)} USDT0</dd>
            </div>
            <div>
              <dt>Allowance</dt>
              <dd>{formatToken(allowance ?? undefined)} USDT0</dd>
            </div>
            <div>
              <dt>Your stake</dt>
              <dd>{formatToken(snapshot?.userTotalStake)} USDT0</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{snapshot ? snapshot.resolvedOutcome ? outcomeLabels[snapshot.resolvedOutcome] : snapshot.closed ? "Closed" : "Open" : "--"}</dd>
            </div>
            <div>
              <dt>Close time</dt>
              <dd>{snapshot?.closeTime ? new Date(Number(snapshot.closeTime) * 1000).toLocaleString() : "--"}</dd>
            </div>
          </dl>
          <button type="button" disabled={!account || !marketId || !snapshot?.resolvedOutcome || snapshot.userClaimed || isBusy} onClick={() => sendTx("claim")}>
            Claim / Refund
          </button>
          <p className="note">
            If the winning pool is zero, the contract only allows `Void`, so users can refund instead of locking funds.
          </p>
        </aside>
      </section>

      <section className="reference-grid">
        <article className="reference-panel champion-panel">
          <div className="section-title">
            <span>Tournament reference</span>
            <h3>Champion market</h3>
          </div>
          <p className="note">
            Winner probabilities are loaded as a reference board for the full-tournament champion view. A separate
            X Layer champion contract is required before these entries can take wallet transactions safely.
          </p>
          {championRefs.length ? (
            <>
              <label>
                Team
                <select
                  value={selectedChampion?.team ?? ""}
                  onChange={(event) => setSelectedChampionTeam(event.target.value)}
                >
                  {championRefs.map((entry) => (
                    <option key={entry.team} value={entry.team}>
                      {entry.team}
                    </option>
                  ))}
                </select>
              </label>
              {selectedChampion ? (
                <div className="champion-card">
                  <span>{selectedChampion.team}</span>
                  <strong>{formatOddsBps(selectedChampion.oddsBps)}</strong>
                  <small>
                    {formatProbability(selectedChampion.probability)} · Volume $
                    {Math.round(selectedChampion.volume ?? 0).toLocaleString()}
                  </small>
                  {selectedChampion.slug ? (
                    <a href={`https://polymarket.com/market/${selectedChampion.slug}`} rel="noreferrer" target="_blank">
                      Open reference
                    </a>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Champion reference data is not loaded.</div>
          )}
        </article>

        <article className="reference-panel">
          <div className="section-title">
            <span>External reference</span>
            <h3>Polymarket signal</h3>
          </div>
          <p className="note">
            These values are public Gamma API references only. X Layer odds and payouts come from this contract's USDT0 pools.
          </p>
          <div className="reference-list">
            {polymarketRefs.length ? (
              polymarketRefs.map((ref) => (
                <a
                  className="reference-item"
                  href={ref.slug ? `https://polymarket.com/market/${ref.slug}` : "https://polymarket.com"}
                  key={ref.slug ?? ref.question}
                  rel="noreferrer"
                  target="_blank"
                >
                  <strong>{ref.question}</strong>
                  <span>
                    {ref.outcomes.map((outcome) => `${outcome.name}${outcome.price ? ` ${outcome.price}` : ""}`).join(" · ")}
                  </span>
                  <small>
                    Volume {ref.volume ?? "--"} · Liquidity {ref.liquidity ?? "--"}
                  </small>
                </a>
              ))
            ) : (
              <div className="empty-state">{polymarketStatus}</div>
            )}
          </div>
        </article>

        <article className="reference-panel">
          <div className="section-title">
            <span>Copilot handoff</span>
            <h3>Extension-style entry</h3>
          </div>
          <p className="note">
            A browser extension should show this as a read-only Team A / Draw / Team B preview, then open this Dapp for wallet actions.
          </p>
          <div className="handoff-actions">
            <a href={`${handoffUrl}&outcome=teamA`}>{selectedMatch?.teamA} intent</a>
            <a href={`${handoffUrl}&outcome=draw`}>Draw intent</a>
            <a href={`${handoffUrl}&outcome=teamB`}>{selectedMatch?.teamB} intent</a>
          </div>
        </article>
      </section>

      <section className="status-line">
        <strong>Runtime</strong>
        <span>{status}</span>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OutcomeButton({
  label,
  pool,
  oddsLabel,
  oddsSource,
  probabilityLabel,
  selected,
  disabled,
  onClick
}: {
  label: string;
  pool?: bigint;
  oddsLabel: string;
  oddsSource: string;
  probabilityLabel: string;
  selected?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`outcome-button${selected ? " selected" : ""}`} type="button" disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{oddsLabel}</strong>
      <small>{oddsSource} · {probabilityLabel} · {formatToken(pool)} USDT0 pool</small>
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
