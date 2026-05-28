import fs from "node:fs";
import path from "node:path";

interface MarketSeed {
  matchId: string;
  officialMatchNumber?: number;
  teamA: string;
  teamB: string;
  group?: string;
  stage?: string;
  closeTimeUtc?: string;
  regularTimeOnly?: boolean;
  settlementSource?: string;
  polymarketQuery?: string;
  referenceProbabilities?: Record<string, number>;
  referenceOddsBps?: Record<string, number>;
  referenceOddsSource?: Record<string, unknown>;
}

interface CreatedMarket extends MarketSeed {
  marketId: string;
  contractAddress: string;
  txHash?: string;
  blockNumber?: number;
}

interface MarketDeployment {
  network: string;
  chainId: number;
  contractAddress: string;
  markets: CreatedMarket[];
}

const marketsDeploymentFile = path.join(process.cwd(), "deployments", "xlayer-mainnet.markets.json");
const seedFile = path.join(process.cwd(), "data", "matches.initial-mainnet.json");
const outputFile = path.join(process.cwd(), "apps", "web", "public", "markets.json");
const extensionOutputFile = path.join(process.cwd(), "apps", "extension", "public", "xlayer-markets.json");
const championReferenceFile = path.join(process.cwd(), "data", "worldcup-2026-champion.reference.json");
const championOutputFile = path.join(process.cwd(), "apps", "web", "public", "champion-odds.json");

function main() {
  if (!fs.existsSync(marketsDeploymentFile)) {
    throw new Error("Missing deployments/xlayer-mainnet.markets.json. Run npm run create-markets:xlayer first.");
  }

  if (!fs.existsSync(seedFile)) {
    throw new Error("Missing data/matches.initial-mainnet.json. Run node scripts/build-reference-data.mjs first.");
  }

  const deployment = JSON.parse(fs.readFileSync(marketsDeploymentFile, "utf8")) as MarketDeployment;
  const seeds = JSON.parse(fs.readFileSync(seedFile, "utf8")) as MarketSeed[];
  const deployedByPair = new Map(deployment.markets.map((market) => [teamPairKey(market.teamA, market.teamB), market]));
  const registry = seeds.map((seed) => {
    const deployed = deployedByPair.get(teamPairKey(seed.teamA, seed.teamB));
    return {
      matchId: seed.matchId,
      marketId: deployed?.marketId,
      marketStatus: deployed?.marketId ? "deployed" : "planned",
      officialMatchNumber: seed.officialMatchNumber,
      teamA: seed.teamA,
      teamB: seed.teamB,
      group: seed.group,
      stage: seed.stage,
      closeTimeUtc: seed.closeTimeUtc,
      regularTimeOnly: seed.regularTimeOnly,
      settlementSource: seed.settlementSource,
      polymarketQuery: seed.polymarketQuery,
      referenceProbabilities: seed.referenceProbabilities,
      referenceOddsBps: seed.referenceOddsBps,
      referenceOddsSource: seed.referenceOddsSource,
      contractAddress: deployment.contractAddress,
      network: deployment.network,
      chainId: deployment.chainId
    };
  });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(registry, null, 2)}\n`);
  fs.writeFileSync(extensionOutputFile, `${JSON.stringify(sanitizeForExtension(registry), null, 2)}\n`);

  if (fs.existsSync(championReferenceFile)) {
    const championReference = JSON.parse(fs.readFileSync(championReferenceFile, "utf8")) as unknown;
    fs.writeFileSync(championOutputFile, `${JSON.stringify(championReference, null, 2)}\n`);
  }

  console.log(`Wrote ${registry.length} web registry market(s) to ${outputFile}`);
  console.log(`Wrote ${registry.length} extension registry market(s) to ${extensionOutputFile}`);
}

main();

function teamPairKey(teamA: string, teamB: string): string {
  return [normalizeComparableText(teamA), normalizeComparableText(teamB)].sort().join("|");
}

function normalizeComparableText(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized === "usa" || normalized === "u s" || normalized === "u s a" || normalized === "usmnt") {
    return "united states";
  }
  return normalized;
}

function sanitizeForExtension(registry: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return registry.map((market) => {
    const {
      polymarketQuery,
      referenceOddsSource,
      ...rest
    } = market;
    return {
      ...rest,
      referenceOddsSource: referenceOddsSource
        ? {
            provider: "External winner-market reference",
            updatedAt: (referenceOddsSource as { updatedAt?: unknown }).updatedAt,
            method: "Derived reference probabilities for empty-pool display."
          }
        : undefined
    };
  });
}
