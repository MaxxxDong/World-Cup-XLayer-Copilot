import type { SourceMetadata, WorldCupMatch } from "../shared/types";
import generatedMatches from "./worldcup-2026.generated.json";

export const worldCupSource: SourceMetadata = {
  sourceName: "FIFA World Cup 2026 official match schedule",
  sourceUrl: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums",
  sourceTimestamp: "2026-05-28"
};

export const worldCupMatches2026 = generatedMatches as unknown as WorldCupMatch[];
