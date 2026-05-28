const slides = [
  {
    kicker: "Cold open",
    title: "刚才那个球员是谁？",
    body: "世界杯最容易错过的，是那几秒钟：镜头切走、字幕闪过、解说太快。",
    extra: `<div class="chip-row"><div class="chip">球员是谁</div><div class="chip">谁进了球</div><div class="chip">解说说了什么</div></div><div class="timeline"></div>`
  },
  {
    kicker: "Match questions",
    title: "问一句，回到刚才。",
    body: "它不是赛后总结，而是贴在比赛旁边，帮你理解正在发生的事。",
    extra: `<div class="browser"><div class="browser-top"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div><div class="panel"><strong>AI Copilot</strong><p style="font-size:18px;color:#d7cbbb">Mexico vs South Africa<br/>Replay ready<br/>Market ready</p></div></div>`
  },
  {
    kicker: "Chrome extension",
    title: "轻量 Chrome 插件。",
    body: "不用换平台，不用打开另一个 App。你在哪个页面看球，它就贴在旁边。",
    extra: `<div class="chip-row"><div class="chip">直播</div><div class="chip">回放</div><div class="chip">集锦</div><div class="chip">FIFA 页面</div><div class="chip">新闻页面</div></div>`
  },
  {
    kicker: "Data context",
    title: "AI 背后有数据。",
    body: "赛程、球队、球员、球场、历史、实时 API，都变成当前比赛上下文。",
    extra: `<div class="grid"><div class="data-card"><strong>Match</strong><span>赛程与阶段</span></div><div class="data-card"><strong>Team</strong><span>别名与历史</span></div><div class="data-card"><strong>Player</strong><span>关键球员</span></div><div class="data-card"><strong>Venue</strong><span>球场城市</span></div><div class="data-card"><strong>Live</strong><span>比分与事件</span></div></div>`
  },
  {
    kicker: "Instant replay",
    title: "画面和声音都能成为证据。",
    body: "最近画面给视觉模型，最近音频给 ASR，再交给 AI 结合比赛背景回答。",
    extra: `<div class="streams"><div class="stream"><div class="kicker">Replay Frames</div><h2 style="font-size:54px">6 frames</h2><p>球衣、号码、字幕、庆祝动作。</p></div><div class="stream"><div class="kicker">ASR Transcript</div><h2 style="font-size:54px">Audio</h2><p>解说、旁白、现场声音。</p></div></div>`
  },
  {
    kicker: "AI answer",
    title: "不是猜，是综合判断。",
    body: "页面文本、画面线索、音频转写和赛事数据一起进入同一个问题。",
    extra: `<div class="chip-row"><div class="chip">刚才谁进球？</div><div class="chip">这人什么背景？</div><div class="chip">当前局势如何？</div></div>`
  },
  {
    kicker: "X Layer market",
    title: "看懂之后，进入市场。",
    body: "插件展示 Team A / Draw / Team B 预览，真正钱包操作在 X Layer Dapp 完成。",
    extra: `<div class="market"><div class="outcome"><strong>Team A</strong><span>X Layer intent</span></div><div class="outcome"><strong>Draw</strong><span>X Layer intent</span></div><div class="outcome"><strong>Team B</strong><span>X Layer intent</span></div></div>`
  },
  {
    kicker: "World-Cup-XLayer-Copilot",
    title: "AI 陪你看球，X Layer 承接行动。",
    body: "把世界杯注意力，变成可以理解、可以追踪、也可以进入链上的体验。",
    extra: `<div class="chip-row"><div class="chip">Chrome 插件</div><div class="chip">AI Agent</div><div class="chip">赛事数据</div><div class="chip">X Layer Dapp</div></div>`
  }
];

const stage = document.getElementById("stage");
const params = new URLSearchParams(window.location.search);
let step = Math.min(Math.max(Number(params.get("step") || 0), 0), slides.length - 1);

function render() {
  const slide = slides[step];
  stage.innerHTML = `
    <section class="scene fade-in">
      <div class="kicker">${slide.kicker}</div>
      <h1>${slide.title}</h1>
      <p>${slide.body}</p>
      ${slide.extra}
      <div class="footer-mark">${String(step + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")} · World-Cup-XLayer-Copilot</div>
    </section>
  `;
}

function go(delta) {
  step = Math.min(Math.max(step + delta, 0), slides.length - 1);
  render();
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowRight") go(1);
  if (event.code === "ArrowLeft") go(-1);
});

render();
