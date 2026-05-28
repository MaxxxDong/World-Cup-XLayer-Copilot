(function () {
  var settingsKey = "worldCupCopilotSettings";
  var themeKey = "worldCupCopilotTheme";

  function normalizeTheme(theme) {
    if (theme === "black") return "black";
    if (theme === "yellow" || theme === "claude") return "yellow";
    return "white";
  }

  function applyTheme(theme) {
    var normalized = normalizeTheme(theme);
    document.documentElement.dataset.theme = normalized;
    document.documentElement.style.backgroundColor = themeBackground(normalized);
    if (document.body) document.body.dataset.theme = normalized;
    try {
      localStorage.setItem(themeKey, normalized);
    } catch (_error) {
      // Storage may be unavailable in unusual browser contexts.
    }
  }

  function themeBackground(theme) {
    if (theme === "black") return "#08090b";
    if (theme === "yellow") return "#f7f2e6";
    return "#f5f5f7";
  }

  try {
    applyTheme(localStorage.getItem(themeKey) || document.documentElement.dataset.theme || "white");
  } catch (_error) {
    applyTheme("white");
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(settingsKey, function (result) {
      var stored = result && result[settingsKey];
      if (stored && stored.theme) applyTheme(stored.theme);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.body) document.body.dataset.theme = document.documentElement.dataset.theme || "white";
  });
})();
