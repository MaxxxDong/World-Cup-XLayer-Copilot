chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") return false;

  const visibleText = collectVisibleText();
  sendResponse({
    ok: true,
    pageContext: {
      url: location.href,
      title: document.title,
      visibleText,
      capturedAt: new Date().toISOString()
    }
  });

  return false;
});

function collectVisibleText(): string {
  const chunks = [
    document.title,
    document.querySelector("meta[property='og:title']")?.getAttribute("content") ?? "",
    document.querySelector("meta[name='description']")?.getAttribute("content") ?? "",
    document.body?.innerText ?? ""
  ];

  return chunks
    .join("\n")
    .replace(/\s+/g, " ")
    .slice(0, 12_000);
}
