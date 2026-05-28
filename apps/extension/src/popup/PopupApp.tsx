import { useEffect, useMemo, useRef, useState } from "react";
import { detectCurrentMatch, selectBestMatchDetection } from "../domain/match-detection";
import { rankMarkets } from "../domain/market-ranking";
import { messages, t } from "../i18n/messages";
import { loadRuntimeWorldCupMatches } from "../services/data-runtime";
import {
  buildXLayerDappUrl,
  buildXLayerDappUrlForMarket,
  searchXLayerMarketsForMatch
} from "../services/xlayer-market";
import { hasLLMSettings, loadSettings, watchSettings } from "../services/settings";
import {
  getActivePageContext,
  getActiveSidePanelTarget,
  openXLayerDappPopup,
  openSidePanel,
  type SidePanelOpenTarget
} from "../shared/chrome-helpers";
import { applyDocumentTheme, getInitialDocumentTheme } from "../shared/theme";
import type { MatchDetectionReason, MatchDetectionResult, RankedMarket, UserSettings } from "../shared/types";

export default function PopupApp() {
  const [settings, setSettings] = useState<UserSettings>();
  const [detection, setDetection] = useState<MatchDetectionResult>();
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [marketStatus, setMarketStatus] = useState("Loading market signals...");
  const [panelError, setPanelError] = useState<string>();
  const [initialTheme] = useState(getInitialDocumentTheme);
  const panelTargetRef = useRef<SidePanelOpenTarget | undefined>(undefined);

  const lang = settings?.language ?? "en";
  const theme = settings?.theme ?? initialTheme;
  const configured = settings ? hasLLMSettings(settings) : false;
  const currentMatchMarkets = useMemo(
    () =>
      markets
        .filter((market) => market.group === "current-match" || market.group === "team-related")
        .slice(0, 2),
    [markets]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      const loadedSettings = await loadSettings();
      const matches = await loadRuntimeWorldCupMatches();
      panelTargetRef.current = await getActiveSidePanelTarget();
      const pageContext = await getActivePageContext();
      const results = detectCurrentMatch({
        nowUtc: new Date().toISOString(),
        pageContext,
        matches
      });
      const selected = selectBestMatchDetection(results);

      if (active) {
        setSettings(loadedSettings);
        setDetection(selected);
        setMarketStatus(selected ? "Loading market signals..." : "No confident match yet.");
      }

      if (!selected) return;
      const candidates = await searchXLayerMarketsForMatch(selected.match);
      const ranked = rankMarkets(selected.match, candidates);
      if (active) {
        setMarkets(ranked);
        setMarketStatus(
          ranked.length
            ? `Loaded ${ranked.length} X Layer outcome markets.`
            : "No X Layer market is seeded for this match yet; open the Dapp fallback."
        );
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => watchSettings(setSettings), []);

  useEffect(() => applyDocumentTheme(theme), [theme]);

  function handleOpenPanelClick() {
    void openSidePanel(panelTargetRef.current).then((opened) => {
      setPanelError(opened ? undefined : t(lang, "sidePanelOpenFailed"));
    });
  }

  return (
    <main className="popup-shell" data-theme={theme}>
      <header>
        <h1>{t(lang, "title")}</h1>
        <p>{t(lang, "subtitle")}</p>
      </header>

      <section className="status-card">
        <span className="status-dot ok" />
        <span>{t(lang, "localDetectionReady")}</span>
        <small>{configured ? `${t(lang, "aiConfiguredShort")}: ${settings?.llm.model}` : t(lang, "aiNotConfigured")}</small>
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          {t(lang, "settings")}
        </button>
      </section>

      <section className="match-card">
        <span className="eyebrow">{t(lang, "detectedMatch")}</span>
        {detection ? (
          <>
            <h2>
              {detection.match.team1} vs {detection.match.team2}
            </h2>
            <p>
              {detection.match.stage} · {detection.match.venue}
            </p>
            <DetectionReasons detection={detection} lang={lang} />
          </>
        ) : (
          <p>{t(lang, "noMatch")}</p>
        )}
      </section>

      <section>
        <h3>{t(lang, "topMarkets")}</h3>
        <div className="market-list">
          {(currentMatchMarkets.length ? currentMatchMarkets : markets.slice(0, 3)).map((market) => (
            <button
              className="market-row"
              key={market.id}
              type="button"
              onClick={() => openXLayerDappPopup(buildXLayerDappUrlForMarket(market))}
            >
              <span>{market.title}</span>
              <small>{formatMarketSnapshot(market)}</small>
              <strong>{formatYesPrice(market)}</strong>
            </button>
          ))}
          {markets.length === 0 ? <p className="muted">{t(lang, "noMarkets")}</p> : null}
          {markets.length === 0 && detection ? (
            <button
              className="market-row"
              type="button"
              onClick={() => openXLayerDappPopup(buildXLayerDappUrl(detection.match))}
            >
              <span>{t(lang, "openDapp")}</span>
              <small>{marketStatus}</small>
            </button>
          ) : null}
        </div>
      </section>

      <button className="primary" type="button" onClick={handleOpenPanelClick}>
        {messages[lang].openPanel}
      </button>
      {panelError ? <p className="muted">{panelError}</p> : null}
    </main>
  );
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

function formatMarketSnapshot(market: RankedMarket): string {
  if (market.provider === "XLayer") {
    const pool =
      typeof market.poolAmountUsdt === "number"
        ? `${market.poolAmountUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT0`
        : "--";
    const total =
      typeof market.totalPoolUsdt === "number"
        ? `${market.totalPoolUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT0`
        : "--";
    return `Pool ${pool} · Total ${total}`;
  }
  const bidAsk =
    typeof market.bestBid === "number" && typeof market.bestAsk === "number"
      ? `Bid ${Math.round(market.bestBid * 100)}% / Ask ${Math.round(market.bestAsk * 100)}%`
      : "Live market";
  const liquidity =
    typeof market.liquidity === "number" ? ` · Liq $${Math.round(market.liquidity).toLocaleString()}` : "";
  return `${bidAsk}${liquidity}`;
}
