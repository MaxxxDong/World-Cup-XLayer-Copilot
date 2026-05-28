export interface TestSite {
  id: string;
  label: string;
  url: string;
  expectedMatch: string;
}

export const testSites: TestSite[] = [
  {
    id: "fifa-mexico-south-africa",
    label: "FIFA: Mexico 2026 fixtures",
    url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/mexico-world-cup-2026-fixtures-stadiums-matches",
    expectedMatch: "Mexico vs South Africa"
  }
];
