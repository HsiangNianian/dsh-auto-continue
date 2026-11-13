// Generate the README images in docs/: banners and the social preview. The
// workflow map is an Archify export (docs/auto-continue-workflow.*), not built here. Every SVG is standalone (system font stack, no external
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
