// Generate the README images in docs/: banners, workflow diagrams and the
// social preview. Every SVG is standalone (system font stack, no external
// references). Run `npm run docs:assets`, then render the social preview PNG:
//   rsvg-convert -w 1280 -h 640 docs/social-preview.svg -o docs/social-preview.png
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const write = (name, svg) => {
  writeFileSync(join(docs, name), `${svg.trim()}\n`);
  console.log(`wrote docs/${name}`);
};

// The mark: a circular arrow wrapped around a play triangle.
const mark = (color) => `
    <path d="M49 17A24 24 0 1 0 56 38" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
    <path d="M49 6v12H37" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M27 22l16 10-16 10Z" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;

const THEMES = {
  light: { bg: '#f4f4f5', tile: '#e4e4e7', ink: '#24262b', muted: '#545961', rule: '#d4d4d8' },
  dark: { bg: '#141414', tile: '#23262c', ink: '#f4f4f5', muted: '#b9bec8', rule: '#37393e' },
};

// ---------------------------------------------------------------- banners

const BANNER_COPY = {
  en: {
    desc: 'A DeepSeek Harness plugin by HsiangNianian. Recover interrupted sessions, at your own pace.',
    tagline: 'Recover interrupted sessions, at your own pace.',
    compact: 'Interrupted? Keep going.',
  },
  zh: {
    desc: 'HsiangNianian 的 DeepSeek Harness 插件。恢复意外中断的会话，按你的节奏继续。',
    tagline: '恢复意外中断的会话，按你的节奏继续。',
    compact: '会话意外中断？接着来。',
  },
  ru: {
    desc: 'Плагин DeepSeek Harness от HsiangNianian. Возвращает прерванные сессии к работе в вашем темпе.',
    tagline: 'Возвращает прерванные сессии к работе.',
    compact: 'Прервалось? Продолжаем.',
  },
};

function banner(lang, themeName) {
  const t = THEMES[themeName];
  const c = BANNER_COPY[lang];
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="260" viewBox="0 0 960 260" role="img" lang="${lang}" aria-labelledby="title description">
  <title id="title">dsh-auto-continue</title>
  <desc id="description">${esc(c.desc)}</desc>
  <style>
    text { font-family: ${FONT}; }
    .wordmark { font-size: 46px; font-weight: 650; letter-spacing: -1.5px; }
    .tagline { font-size: 24px; }
    .compact { display: none; }
    @media (max-width: 520px) {
      .eyebrow { font-size: 23px; letter-spacing: 0; }
      .wordmark { font-size: 49px; }
      .tagline { font-size: 32px; }
      .credit { font-size: 25px; }
      .full { display: none; }
      .compact { display: inline; }
    }
  </style>
  <rect width="960" height="260" rx="18" fill="${t.bg}"/>
  <rect x="40" y="48" width="112" height="112" rx="28" fill="${t.tile}"/>
  <g transform="translate(57 64) scale(1.25)">${mark(t.ink)}
  </g>
  <g fill="${t.ink}">
    <text class="eyebrow" x="188" y="61" fill="${t.muted}" font-size="15" letter-spacing="1.6">DEEPSEEK HARNESS PLUGIN</text>
    <text class="wordmark" x="185" y="118">dsh-auto-continue</text>
    <text class="tagline full" x="188" y="163" fill="${t.muted}">${esc(c.tagline)}</text>
    <text class="tagline compact" x="188" y="163" fill="${t.muted}">${esc(c.compact)}</text>
  </g>
  <path d="M40 200H920" stroke="${t.rule}"/>
  <text class="credit" x="40" y="236" fill="${t.muted}" font-size="16">by HsiangNianian</text>
  <!-- A broken thread joining back into one line. -->
  <g fill="none" stroke="${t.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M700 230h44m12 0h3m12 0h3m12 0h126"/>
    <path d="m902 224 10 6-10 6"/>
  </g>
</svg>`;
}

for (const lang of ['en', 'zh', 'ru']) {
  const suffix = lang === 'en' ? '' : `-${lang}`;
  write(`banner${suffix}.svg`, banner(lang, 'light'));
  write(`banner${suffix}-dark.svg`, banner(lang, 'dark'));
}

// ---------------------------------------------------------- social preview

write('social-preview.svg', `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" lang="en" aria-labelledby="title">
  <title id="title">dsh-auto-continue: recover interrupted DeepSeek Harness sessions</title>
  <style>
    text { font-family: ${FONT}; }
  </style>
  <rect width="1280" height="640" fill="${THEMES.dark.bg}"/>
  <rect x="96" y="128" width="168" height="168" rx="42" fill="${THEMES.dark.tile}"/>
  <g transform="translate(120 150) scale(1.9)">${mark(THEMES.dark.ink)}
  </g>
  <text x="320" y="160" fill="${THEMES.dark.muted}" font-size="22" letter-spacing="2.4">DEEPSEEK HARNESS PLUGIN</text>
  <text x="316" y="240" fill="${THEMES.dark.ink}" font-size="74" font-weight="650" letter-spacing="-2">dsh-auto-continue</text>
  <text x="320" y="300" fill="${THEMES.dark.muted}" font-size="32">Recover interrupted sessions, at your own pace.</text>
  <g font-size="22" fill="${THEMES.dark.ink}">
    <rect x="320" y="356" width="214" height="50" rx="25" fill="none" stroke="${THEMES.dark.rule}" stroke-width="2"/>
    <text x="427" y="389" text-anchor="middle">Error recovery</text>
    <rect x="550" y="356" width="214" height="50" rx="25" fill="none" stroke="${THEMES.dark.rule}" stroke-width="2"/>
    <text x="657" y="389" text-anchor="middle">Startup scan</text>
    <rect x="780" y="356" width="250" height="50" rx="25" fill="none" stroke="${THEMES.dark.rule}" stroke-width="2"/>
    <text x="905" y="389" text-anchor="middle">Autonomous loop</text>
  </g>
  <path d="M96 520H1184" stroke="${THEMES.dark.rule}" stroke-width="2"/>
  <text x="96" y="572" fill="${THEMES.dark.muted}" font-size="24">github.com/HsiangNianian/dsh-auto-continue</text>
  <g fill="none" stroke="${THEMES.dark.muted}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M884 564h60m16 0h4m16 0h4m16 0h168"/>
    <path d="m1172 556 12 8-12 8"/>
  </g>
</svg>`);

// -------------------------------------------------------- workflow diagram
//
// Mirrors src/host/engine.ts: sources (live turn/end, startup scan, loop
// guard) → session gate → reason → retry budget or loop round limit → grace
// → offline hold → send. Child hand-off and "Resume now" enter at the send.

const W = 1200;
const COL = { L: [30, 290], C: [390, 420], R: [880, 290] };
const ROW = (n) => 112 + (n - 1) * 140;
const NODE_H = 104;

const KINDS = ['source', 'gate', 'stop', 'loop', 'send'];

function node(id, col, row, kind, lines, key) {
  const [x, w] = COL[col];
  return { id, x, y: ROW(row), w, h: NODE_H, kind, lines, key };
}

function renderNode(n) {
  const [title, ...body] = n.lines;
  const out = [`  <g class="node ${n.kind}">`];
  out.push(`    <rect class="card" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12"/>`);
  out.push(`    <rect class="strip" x="${n.x}" y="${n.y + 14}" width="4" height="${n.h - 28}" rx="2"/>`);
  out.push(`    <text class="title" x="${n.x + 20}" y="${n.y + 28}">${esc(title)}</text>`);
  body.forEach((line, i) => {
    out.push(`    <text class="body" x="${n.x + 20}" y="${n.y + 51 + i * 19}">${esc(line)}</text>`);
  });
  if (n.key) out.push(`    <text class="key" x="${n.x + 20}" y="${n.y + n.h - 14}">${esc(n.key)}</text>`);
  out.push('  </g>');
  return out.join('\n');
}

const mid = (n) => n.y + n.h / 2;
const cx = (n) => n.x + n.w / 2;

function label(x, y, text, anchor = 'middle') {
  return `  <text class="edge-label" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;
}

function workflow(lang, t) {
  const n = {
    live: node('live', 'L', 1, 'source', t.live, t.liveKey),
    boot: node('boot', 'C', 1, 'source', t.boot, 'scanOnBoot · freshMs · scanLimit'),
    guard: node('guard', 'R', 1, 'source', t.guard, 'loopGuard · loopText'),
    gate: node('gate', 'C', 2, 'gate', t.gate, 'paused · sessionModes'),
    skip: node('skip', 'L', 2, 'stop', t.skip),
    reason: node('reason', 'C', 3, 'gate', t.reason, 'classify · retryableErrorPatterns'),
    leave: node('leave', 'L', 3, 'stop', t.leave),
    loop: node('loop', 'R', 3, 'loop', t.loop, 'resumeCompletedTurns'),
    budget: node('budget', 'C', 4, 'gate', t.budget, 'maxConsecutive · cooldownMs · backoff*'),
    giveup: node('giveup', 'L', 4, 'stop', t.giveup),
    rounds: node('rounds', 'R', 4, 'loop', t.rounds, 'loopMaxIterations'),
    grace: node('grace', 'C', 5, 'gate', t.grace, 'graceMs'),
    online: node('online', 'C', 6, 'gate', t.online, 'pauseWhenOffline · offlineCheckMs'),
    hold: node('hold', 'R', 6, 'stop', t.hold),
    send: node('send', 'C', 7, 'send', t.send, 'continueText* · guardTools · resumeGoals'),
    child: node('child', 'L', 7, 'source', t.child, 'resumeInterruptedChildren'),
    now: node('now', 'R', 7, 'source', t.now),
  };
  const H = ROW(7) + NODE_H + 96;
  const e = [];
  const arrow = (d) => e.push(`  <path class="edge" d="${d}" marker-end="url(#arrow)"/>`);
  const line = (d) => e.push(`  <path class="edge" d="${d}"/>`);

  // Sources merge on a bus into the gate.
  const busY = n.live.y + NODE_H + 18;
  line(`M${cx(n.live)} ${n.live.y + NODE_H}V${busY}H${cx(n.guard)}V${n.guard.y + NODE_H}`);
  arrow(`M${cx(n.boot)} ${n.boot.y + NODE_H}V${n.gate.y - 2}`);
  // Main chain.
  for (const [a, b] of [['gate', 'reason'], ['reason', 'budget'], ['budget', 'grace'], ['grace', 'online'], ['online', 'send']]) {
    arrow(`M${cx(n[a])} ${n[a].y + NODE_H}V${n[b].y - 2}`);
  }
  // Exits to the left.
  for (const [from, to, text] of [['gate', 'skip', t.edges.no], ['reason', 'leave', t.edges.stop], ['budget', 'giveup', t.edges.cap]]) {
    arrow(`M${n[from].x} ${mid(n[from])}H${n[to].x + n[to].w + 2}`);
    e.push(label((n[from].x + n[to].x + n[to].w) / 2, mid(n[from]) - 8, text));
  }
  // Autonomous loop branch.
  arrow(`M${n.reason.x + n.reason.w} ${mid(n.reason)}H${n.loop.x - 2}`);
  e.push(label((n.reason.x + n.reason.w + n.loop.x) / 2, mid(n.reason) - 8, t.edges.loop));
  arrow(`M${cx(n.loop)} ${n.loop.y + NODE_H}V${n.rounds.y - 2}`);
  arrow(`M${cx(n.rounds)} ${n.rounds.y + NODE_H}V${mid(n.grace)}H${n.grace.x + n.grace.w + 2}`);
  e.push(label(cx(n.rounds) + 10, n.rounds.y + NODE_H + 22, t.edges.under, 'start'));
  // Offline hold, and its way back to the grace period once online.
  arrow(`M${n.online.x + n.online.w} ${mid(n.online)}H${n.hold.x - 2}`);
  e.push(label((n.online.x + n.online.w + n.hold.x) / 2, mid(n.online) - 8, t.edges.offline));
  const backX = n.hold.x + n.hold.w - 60;
  arrow(`M${backX} ${n.hold.y}V${mid(n.grace) + 16}H${n.grace.x + n.grace.w + 2}`);
  e.push(label(backX + 8, n.hold.y - 14, t.edges.online, 'start'));
  // Side entries into the send step.
  arrow(`M${n.child.x + n.child.w} ${mid(n.send)}H${n.send.x - 2}`);
  e.push(label((n.child.x + n.child.w + n.send.x) / 2, mid(n.send) - 8, t.edges.root));
  arrow(`M${n.now.x} ${mid(n.send)}H${n.send.x + n.send.w + 2}`);

  // Right-aligned legend; widths are estimated per script (CJK is full width).
  const textWidth = (text) => [...text].reduce((sum, ch) => sum + (/[\u2E80-\uFFEF]/.test(ch) ? 14 : /[\u0400-\u04FF]/.test(ch) ? 8.6 : 8), 0);
  let legendX = W - 30;
  const legend = [...KINDS].reverse().map((kind) => {
    const text = t.legend[kind];
    legendX -= textWidth(text) + 18;
    const x = legendX;
    legendX -= 22;
    return `    <g class="node ${kind}"><rect class="strip" x="${x}" y="54" width="12" height="12" rx="3"/><text class="legend" x="${x + 18}" y="65">${esc(text)}</text></g>`;
  }).reverse().join('\n');

  const footY = ROW(7) + NODE_H + 46;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" lang="${lang}" aria-labelledby="title description">
  <title id="title">${esc(t.title)}</title>
  <desc id="description">${esc(t.desc)}</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="arrowhead" d="M0 0L10 5L0 10Z"/>
    </marker>
  </defs>
  <style>
    text { font-family: ${FONT}; }
    .bg { fill: #f6f8fa; }
    .heading { fill: #1f2328; font-size: 24px; font-weight: 650; }
    .sub, .legend, .foot { fill: #59636e; font-size: 14px; }
    .card { fill: #ffffff; stroke: #d1d9e0; }
    .title { fill: #1f2328; font-size: 16px; font-weight: 650; }
    .body { fill: #424a53; font-size: 13.5px; }
    .key { font-family: ${MONO}; font-size: 12px; }
    .edge { fill: none; stroke: #8c959f; stroke-width: 1.6; }
    .arrowhead { fill: #8c959f; }
    .edge-label { fill: #59636e; font-size: 12px; }
    .source .strip, .source .key { fill: #0969da; }
    .gate .strip, .gate .key { fill: #9a6700; }
    .stop .strip, .stop .key { fill: #cf222e; }
    .loop .strip, .loop .key { fill: #8250df; }
    .send .strip, .send .key { fill: #1a7f37; }
    .send .card { stroke: #1a7f37; stroke-width: 1.5; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0d1117; }
      .heading, .title { fill: #e6edf3; }
      .sub, .legend, .foot, .edge-label { fill: #9198a1; }
      .card { fill: #161b22; stroke: #3d444d; }
      .body { fill: #c9d1d9; }
      .edge { stroke: #656c76; }
      .arrowhead { fill: #656c76; }
      .source .strip, .source .key { fill: #4493f8; }
      .gate .strip, .gate .key { fill: #d29922; }
      .stop .strip, .stop .key { fill: #f85149; }
      .loop .strip, .loop .key { fill: #ab7df8; }
      .send .strip, .send .key { fill: #3fb950; }
      .send .card { stroke: #3fb950; }
    }
  </style>
  <rect class="bg" width="${W}" height="${H}" rx="16"/>
  <text class="heading" x="30" y="46">${esc(t.title)}</text>
  <text class="sub" x="30" y="72">${esc(t.subtitle)}</text>
${legend}
${e.join('\n')}
${Object.values(n).map(renderNode).join('\n')}
  <text class="foot" x="30" y="${footY}">${esc(t.foot[0])}</text>
  <text class="foot" x="30" y="${footY + 22}">${esc(t.foot[1])}</text>
</svg>`;
}

const WORKFLOW_COPY = {
  en: {
    title: 'How auto-continue decides',
    subtitle: 'Runs in the DSH host, one engine for all tabs',
    desc: 'Flow chart. Three triggers (a turn ends, the host restarts, a turn repeats itself) pass a session check, then the end reason decides: stop, recover, or continue the autonomous loop. Recovery checks the retry budget, waits the grace period, holds while offline, and sends the continue text. Child sessions are handed to their root session; Resume now sends at once.',
    legend: { source: 'Trigger', gate: 'Check', stop: 'Stop / wait', loop: 'Loop', send: 'Send' },
    live: ['A turn ends', 'turn/end in a live session:', 'error, max-tokens, silent, completed'],
    liveKey: 'resumeSilentTurns',
    boot: ['The host restarts', 'Startup scan reads open and stored sessions', 'interrupted inside the scan window'],
    guard: ['A turn repeats itself', 'Loop guard cancels the running', 'turn and restarts it'],
    gate: ['Allowed to continue?', 'Not globally paused, mode is not Off,', 'no 1-hour pause, not a subagent session'],
    skip: ['Skip', 'Logged with [auto-continue];', 'nothing is sent'],
    reason: ['Why did it end?', 'Error, max-tokens, silent turn, restart or', 'loop-guard cancel: recover'],
    leave: ['Leave it alone', 'You pressed Stop, a policy blocked', 'it, or the error is permanent'],
    loop: ['Autonomous loop', 'Completed normally in Loop mode;', 'no cooldown, no consecutive cap'],
    budget: ['Retry budget left?', 'Below Max consecutive. Inside the cooldown', 'the send waits (cooldown × factor, capped)'],
    giveup: ['Give up', 'Notifies; resets when you write', 'or a turn shows visible output'],
    rounds: ['Round limit', 'Stops at the limit and tells', 'you once; 0 means no limit'],
    grace: ['Grace period', 'Wait 3 s by default. A new turn or a', 'message from you cancels the send'],
    online: ['Network up?', 'Network errors only. While offline the send', 'is held and does not use up retries'],
    hold: ['Hold', 'Re-check every 15 s; once online,', 'go through grace and cooldown again'],
    send: ['Send', 'Pick the text for the reason, add the', 'tool-guard note, call agent.followup'],
    child: ['Child sessions', 'Never resumed directly; after a', 'restart the root gets one list'],
    now: ['Resume now', 'Notification button: one send,', 'ignores pause, cooldown and cap'],
    edges: { no: 'no', stop: 'stop', cap: 'cap hit', loop: 'loop', under: 'under limit', offline: 'offline', online: 'online', root: 'to root' },
    foot: [
      'After a send the new turn is watched like any other. A new turn or your own message cancels anything still waiting.',
      'Counters live in host memory. Session modes and the global pause are saved with your profile config.',
    ],
  },
  zh: {
    title: '自动继续如何判断',
    subtitle: '运行在 DSH 宿主进程中，所有标签页共用一个引擎',
    desc: '流程图。三个触发源(回合结束、宿主重启、回合陷入重复)先经过会话检查，再按结束原因分流：不处理、恢复或继续自主循环。恢复路径依次检查重试预算、等待宽限期、断网时挂起，最后发送继续文本。子会话交给根会话处理；“立即续跑”直接发送。',
    legend: { source: '触发', gate: '检查', stop: '停止/等待', loop: '循环', send: '发送' },
    live: ['回合结束', '会话中的 turn/end：', 'error、max-tokens、无输出、completed'],
    liveKey: 'resumeSilentTurns',
    boot: ['宿主重启', '启动扫描读取已打开和已存储的会话，', '只处理扫描时间窗内的中断'],
    guard: ['回合陷入重复', '循环守卫打断正在运行的回合，', '然后重新开始'],
    gate: ['允许继续吗？', '未全局暂停、会话模式不是“关闭”、', '没有 1 小时暂停、不是子代理会话'],
    skip: ['跳过', '记录 [auto-continue] 日志，', '不发送任何内容'],
    reason: ['回合为什么结束？', '错误、max-tokens、无输出、宿主重启', '或循环守卫打断：进入恢复'],
    leave: ['不处理', '你按了停止、被策略拦截，', '或是永久性错误'],
    loop: ['自主循环', '“自主循环”模式下正常完成；', '不受冷却和连续上限约束'],
    budget: ['还有重试次数吗？', '低于最大连续次数。冷却期内会等待', '(冷却 × 退避系数，有上限)'],
    giveup: ['放弃', '发通知；你发消息或回合有', '可见输出后重新计数'],
    rounds: ['轮数上限', '到达上限后停止并提示一次；', '0 表示不限'],
    grace: ['宽限期', '默认等 3 秒。期间开始新回合或', '你发了消息，就取消这次发送'],
    online: ['网络通吗？', '只针对网络错误。断网时挂起，', '不消耗重试次数'],
    hold: ['挂起', '每 15 秒复检；联网后', '重新经过宽限期和冷却'],
    send: ['发送', '按原因选择继续文本，附上工具护栏', '提示，调用 agent.followup'],
    child: ['子会话', '从不直接续跑；重启后', '根会话收到一份清单'],
    now: ['立即续跑', '通知按钮：立即发送一次，', '忽略暂停、冷却和上限'],
    edges: { no: '否', stop: '停止', cap: '达到上限', loop: '循环', under: '未达上限', offline: '断网', online: '恢复联网', root: '根会话' },
    foot: [
      '发送后，新回合会像其他回合一样继续被监视。新回合开始或你自己发消息，都会取消还在等待的发送。',
      '计数器保存在宿主内存中；会话模式和全局暂停随 profile 配置保存。',
    ],
  },
  ru: {
    title: 'Как auto-continue принимает решение',
    subtitle: 'Работает в хост-процессе DSH, один движок на все вкладки',
    desc: 'Блок-схема. Три источника (ход завершился, хост перезапустился, ход зациклился) проходят проверку сессии, затем причина завершения определяет действие: ничего не делать, восстановить или продолжить автономный цикл. Восстановление проверяет лимит попыток, ждёт паузу, удерживает отправку без сети и отправляет текст продолжения. Дочерние сессии передаются корневой; «Resume now» отправляет сразу.',
    legend: { source: 'Источник', gate: 'Проверка', stop: 'Стоп/ожидание', loop: 'Цикл', send: 'Отправка' },
    live: ['Ход завершился', 'turn/end в открытой сессии:', 'error, max-tokens, пустой, completed'],
    liveKey: 'resumeSilentTurns',
    boot: ['Хост перезапустился', 'Стартовое сканирование открытых и', 'сохранённых сессий в пределах окна'],
    guard: ['Ход зациклился', 'Защита от циклов прерывает', 'текущий ход и запускает заново'],
    gate: ['Можно продолжать?', 'Нет глобальной паузы, режим не Off, нет', 'паузы на 1 час, это не сессия субагента'],
    skip: ['Пропуск', 'Запись в лог [auto-continue],', 'ничего не отправляется'],
    reason: ['Почему ход завершился?', 'Ошибка, max-tokens, пустой ход, рестарт', 'или прерывание защитой: восстановить'],
    leave: ['Не трогать', 'Вы нажали Stop, политика', 'запретила, или ошибка постоянная'],
    loop: ['Автономный цикл', 'Ход завершён штатно в режиме Loop;', 'без паузы между попытками и лимита'],
    budget: ['Попытки остались?', 'Меньше Max consecutive. В период cooldown', 'отправка ждёт (cooldown × factor, с потолком)'],
    giveup: ['Остановка', 'Уведомление; счётчик сбросится,', 'когда вы напишете или ход даст ответ'],
    rounds: ['Лимит раундов', 'На лимите цикл останавливается', 'и сообщает об этом; 0 = без лимита'],
    grace: ['Пауза перед отправкой', 'По умолчанию 3 с. Новый ход или ваше', 'сообщение отменяют отправку'],
    online: ['Сеть есть?', 'Только для сетевых ошибок. Без сети', 'отправка ждёт и не тратит попытки'],
    hold: ['Ожидание сети', 'Проверка каждые 15 с; потом снова', 'пауза перед отправкой и cooldown'],
    send: ['Отправка', 'Текст по причине остановки, заметка', 'о последнем инструменте, agent.followup'],
    child: ['Дочерние сессии', 'Не продолжаются напрямую; после', 'рестарта корень получает список'],
    now: ['Resume now', 'Кнопка в уведомлении: отправить', 'сейчас, без паузы и лимитов'],
    edges: { no: 'нет', stop: 'стоп', cap: 'лимит', loop: 'цикл', under: 'ниже лимита', offline: 'нет сети', online: 'сеть есть', root: 'корню' },
    foot: [
      'После отправки новый ход отслеживается как обычно. Новый ход или ваше сообщение отменяют всё, что ещё ждёт отправки.',
      'Счётчики хранятся в памяти хоста. Режимы сессий и глобальная пауза сохраняются в конфигурации профиля.',
    ],
  },
};

for (const lang of ['en', 'zh', 'ru']) {
  const suffix = lang === 'en' ? '' : `-${lang}`;
  write(`workflow${suffix}.svg`, workflow(lang, WORKFLOW_COPY[lang]));
}
