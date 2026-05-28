import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCHEDULE_URL = "https://worldcuply.com/schedule.html";
const FIFA_SOURCE_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums";
const POLYMARKET_WINNER_SEARCH_URL =
  "https://gamma-api.polymarket.com/public-search?q=2026%20FIFA%20World%20Cup%20Winner&limit=10";
const GENERATED_AT = new Date().toISOString();

const TEAM_ALIASES = {
  "United States": ["usa", "usmnt", "u.s.", "united states"],
  "South Africa": ["south africa", "bafana bafana"],
  "South Korea": ["south korea", "korea republic", "korea"],
  "Czech Republic": ["czech republic", "czechia"],
  "Bosnia and Herzegovina": ["bosnia", "bosnia and herzegovina", "bih"],
  "Bosnia & Herzegovina": ["bosnia", "bosnia and herzegovina", "bih"],
  "New Zealand": ["new zealand", "all whites"],
  "Ivory Coast": ["ivory coast", "cote d ivoire"],
  "DR Congo": ["dr congo", "congo dr", "democratic republic of congo"],
  "Curaçao": ["curacao", "curaçao"],
  "Cape Verde": ["cape verde", "cabo verde"],
  "Saudi Arabia": ["saudi arabia", "ksa"],
  "United Arab Emirates": ["united arab emirates", "uae"],
  "North Macedonia": ["north macedonia"],
  "Costa Rica": ["costa rica"],
  "Trinidad and Tobago": ["trinidad and tobago", "trinidad & tobago"],
  "England": ["england", "three lions"],
  "Netherlands": ["netherlands", "holland", "oranje"],
  "Argentina": ["argentina", "la albiceleste"],
  "Brazil": ["brazil", "seleção", "selecao"],
  "Mexico": ["mexico", "méxico", "el tri"],
  "Germany": ["germany", "deutschland"],
  "Spain": ["spain", "españa", "espana"],
  "Portugal": ["portugal"],
  "France": ["france", "les bleus"]
};

const TEAM_CANONICAL = {
  USA: "United States",
  "U.S.": "United States",
  USMNT: "United States",
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Türkiye": "Turkey",
  Turkiye: "Turkey",
  "Curaçao": "Curaçao",
  Curacao: "Curaçao",
  "DR Congo": "DR Congo",
  "Congo DR": "DR Congo"
};

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, "·")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normalizeComparable(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalizeComparable(value).replace(/\s+/g, "-");
}

function canonicalTeam(value) {
  const clean = decodeHtml(String(value));
  return TEAM_CANONICAL[clean] ?? clean;
}

function aliasesFor(teamA, teamB) {
  return {
    [teamA]: unique([teamA.toLowerCase(), ...(TEAM_ALIASES[teamA] ?? TEAM_ALIASES[canonicalTeam(teamA)] ?? [])]),
    [teamB]: unique([teamB.toLowerCase(), ...(TEAM_ALIASES[teamB] ?? TEAM_ALIASES[canonicalTeam(teamB)] ?? [])])
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function teamPairKey(teamA, teamB) {
  return [normalizeComparable(teamA), normalizeComparable(teamB)].sort().join("|");
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function parseGroupStage(html) {
  const matches = [];
  const matchRegex = /<div class="match" id="match-(\d+)">([\s\S]*?)(?=<div class="match" id="match-\d+">|<section|<\/main>)/g;
  let match;
  while ((match = matchRegex.exec(html)) !== null) {
    const block = match[2];
    const number = Number(match[1]);
    const group = decodeHtml(block.match(/<span class="round-badge[^"]*">([^<]+)<\/span>/)?.[1] ?? "");
    if (!/^Group\s+[A-L]$/i.test(group)) continue;
    const teams = [...block.matchAll(/<span class="tn">([^<]+)<\/span>/g)].map((entry) => canonicalTeam(entry[1]));
    const kickoffUtc = decodeHtml(block.match(/<time datetime="([^"]+)"/)?.[1] ?? "");
    const venue = decodeHtml(block.match(/<span class="venue">([^<]+)<\/span>/)?.[1] ?? "");
    if (teams.length < 2 || !kickoffUtc || !venue) {
      throw new Error(`Could not parse group-stage match ${number}`);
    }
    matches.push({
      officialMatchNumber: number,
      teamA: teams[0],
      teamB: teams[1],
      group,
      stage: "Group Stage",
      closeTimeUtc: new Date(kickoffUtc).toISOString(),
      venue
    });
  }
  return matches.sort((a, b) => a.officialMatchNumber - b.officialMatchNumber);
}

function parseGammaList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

function extractTeamFromQuestion(question) {
  const match = String(question).match(/^Will\s+(.+?)\s+win\s+the\s+2026\s+FIFA\s+World\s+Cup\?/i);
  return match ? canonicalTeam(match[1]) : undefined;
}

function parseChampionReferences(searchPayload) {
  const event = searchPayload.events?.find((item) =>
    normalizeComparable(item.title ?? "").includes("2026 fifa world cup winner")
  );
  if (!event?.markets?.length) throw new Error("Could not find Polymarket 2026 FIFA World Cup Winner event markets");
  const entries = event.markets
    .map((market) => {
      const outcomes = parseGammaList(market.outcomes);
      const prices = parseGammaList(market.outcomePrices).map(Number);
      const yesIndex = outcomes.findIndex((outcome) => normalizeComparable(outcome) === "yes");
      const probability = prices[yesIndex >= 0 ? yesIndex : 0];
      const team = extractTeamFromQuestion(market.question ?? "");
      if (!team || !Number.isFinite(probability) || probability <= 0) return undefined;
      return {
        team,
        probability,
        oddsBps: Math.round((1 / probability) * 10000),
        question: market.question,
        slug: market.slug,
        volume: numericOrUndefined(market.volume),
        liquidity: numericOrUndefined(market.liquidity),
        updatedAt: market.updatedAt ?? event.updatedAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.probability - a.probability);

  return {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title?.trim(),
      sourceUrl: `https://polymarket.com/event/${event.slug}`,
      gammaUrl: POLYMARKET_WINNER_SEARCH_URL,
      updatedAt: event.updatedAt,
      volume: numericOrUndefined(event.volume),
      liquidity: numericOrUndefined(event.liquidity)
    },
    entries
  };
}

function numericOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function referenceProbabilities(match, championProbabilityByTeam) {
  const strengthA = championProbabilityByTeam.get(normalizeComparable(match.teamA)) ?? 0.002;
  const strengthB = championProbabilityByTeam.get(normalizeComparable(match.teamB)) ?? 0.002;
  const ratio = strengthA / (strengthA + strengthB);
  const balance = 1 - Math.abs(ratio - 0.5) * 2;
  const draw = clamp(0.18 + balance * 0.1, 0.16, 0.3);
  const remaining = 1 - draw;
  const teamA = remaining * ratio;
  const teamB = remaining - teamA;
  return normalizeProbabilities({ teamA, draw, teamB });
}

function normalizeProbabilities(probabilities) {
  const total = probabilities.teamA + probabilities.draw + probabilities.teamB;
  return {
    teamA: roundProbability(probabilities.teamA / total),
    draw: roundProbability(probabilities.draw / total),
    teamB: roundProbability(probabilities.teamB / total)
  };
}

function roundProbability(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function oddsBpsFromProbability(value) {
  return value > 0 ? Math.round((1 / value) * 10000) : 0;
}

function matchSeed(match, existingByPair, championProbabilityByTeam, championEvent) {
  const existing = existingByPair.get(teamPairKey(match.teamA, match.teamB));
  const matchId =
    existing?.matchId ??
    `wc-2026-${String(match.officialMatchNumber).padStart(3, "0")}-${slugify(match.teamA)}-${slugify(match.teamB)}`;
  const referenceProbabilitiesValue = referenceProbabilities(match, championProbabilityByTeam);
  const referenceOddsBps = {
    teamA: oddsBpsFromProbability(referenceProbabilitiesValue.teamA),
    draw: oddsBpsFromProbability(referenceProbabilitiesValue.draw),
    teamB: oddsBpsFromProbability(referenceProbabilitiesValue.teamB)
  };

  return {
    matchId,
    officialMatchNumber: match.officialMatchNumber,
    teamA: match.teamA,
    teamB: match.teamB,
    group: match.group,
    stage: match.stage,
    closeTimeUtc: match.closeTimeUtc,
    regularTimeOnly: true,
    settlementSource: "FIFA official result",
    polymarketQuery: `${match.teamA} ${match.teamB} 2026 World Cup`,
    referenceProbabilities: referenceProbabilitiesValue,
    referenceOddsBps,
    referenceOddsSource: {
      provider: "Polymarket Gamma API",
      eventSlug: championEvent.slug,
      sourceUrl: championEvent.sourceUrl,
      updatedAt: championEvent.updatedAt,
      method: "Derived from Polymarket 2026 FIFA World Cup winner probabilities, with a deterministic draw adjustment."
    }
  };
}

function extensionMatch(match) {
  const team1 = match.teamA;
  const team2 = match.teamB;
  return {
    id: `2026-${slugify(match.group)}-${slugify(team1)}-${slugify(team2)}`,
    kickoffUtc: match.closeTimeUtc,
    team1,
    team2,
    teamAliases: aliasesFor(team1, team2),
    group: match.group,
    stage: "Group Stage",
    venue: match.venue,
    source: {
      sourceName: "FIFA World Cup 2026 official match schedule",
      sourceUrl: FIFA_SOURCE_URL,
      sourceTimestamp: GENERATED_AT.slice(0, 10)
    },
    marketSearchQueries: [
      `${team1} ${team2} 2026 World Cup`,
      `${team1} vs ${team2}`,
      "2026 World Cup winner"
    ]
  };
}

function sanitizeForExtension(registry) {
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
            updatedAt: referenceOddsSource.updatedAt,
            method: "Derived reference probabilities for empty-pool display."
          }
        : undefined
    };
  });
}

async function main() {
  const [scheduleHtml, championSearch] = await Promise.all([
    fetchText(SCHEDULE_URL),
    fetchJson(POLYMARKET_WINNER_SEARCH_URL)
  ]);

  const parsedMatches = parseGroupStage(scheduleHtml);
  if (parsedMatches.length !== 72) {
    throw new Error(`Expected 72 group-stage matches, parsed ${parsedMatches.length}`);
  }

  const champion = parseChampionReferences(championSearch);
  const championProbabilityByTeam = new Map(
    champion.entries.map((entry) => [normalizeComparable(entry.team), entry.probability])
  );
  const existingDeployment = readJsonIfExists(path.join(ROOT, "deployments", "xlayer-mainnet.markets.json"), { markets: [] });
  const existingByPair = new Map(
    (existingDeployment.markets ?? []).map((market) => [teamPairKey(market.teamA, market.teamB), market])
  );

  const seeds = parsedMatches.map((match) =>
    matchSeed(match, existingByPair, championProbabilityByTeam, champion.event)
  );
  const extensionMatches = parsedMatches.map(extensionMatch);

  const groupStageReference = {
    schemaVersion: "1.0",
    generatedAt: GENERATED_AT,
    scheduleSource: {
      authority: "FIFA official result and match schedule",
      sourceUrl: FIFA_SOURCE_URL,
      structuredExtractionUrl: SCHEDULE_URL
    },
    referenceOddsSource: {
      provider: "Polymarket Gamma API",
      sourceUrl: champion.event.sourceUrl,
      gammaUrl: champion.event.gammaUrl,
      updatedAt: champion.event.updatedAt,
      method: "Champion winner probabilities are used as team strength inputs; draw probability is deterministic by strength balance."
    },
    matches: seeds
  };

  const championReference = {
    schemaVersion: "1.0",
    generatedAt: GENERATED_AT,
    source: {
      provider: "Polymarket Gamma API",
      sourceUrl: champion.event.sourceUrl,
      gammaUrl: champion.event.gammaUrl,
      updatedAt: champion.event.updatedAt
    },
    entries: champion.entries
  };

  writeJson(path.join(ROOT, "data", "worldcup-2026-group-stage.reference.json"), groupStageReference);
  writeJson(path.join(ROOT, "data", "worldcup-2026-champion.reference.json"), championReference);
  writeJson(path.join(ROOT, "data", "matches.initial-mainnet.json"), seeds);
  writeJson(path.join(ROOT, "apps", "extension", "src", "data", "worldcup-2026.generated.json"), extensionMatches);

  const extensionChampion = {
    schemaVersion: championReference.schemaVersion,
    generatedAt: championReference.generatedAt,
    source: {
      provider: "External winner-market reference",
      updatedAt: champion.event.updatedAt
    },
    entries: champion.entries.map(({ team, probability, oddsBps }) => ({ team, probability, oddsBps }))
  };
  writeJson(path.join(ROOT, "apps", "extension", "public", "xlayer-champion.json"), extensionChampion);

  console.log(`Generated ${seeds.length} group-stage reference match(es).`);
  console.log(`Generated ${champion.entries.length} champion reference team(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
