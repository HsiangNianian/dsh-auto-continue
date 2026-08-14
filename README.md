<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.svg">
    <img src="docs/banner.svg" alt="dsh-auto-continue" width="720">
  </picture>
</p>

<h1 align="center">dsh-auto-continue</h1>

<p align="center">
  <em>DSH Web UI plugin — when a request is interrupted by a network error or any other non-human cause, it automatically types 「继续」 and sends it for you.</em>
</p>

<p align="center">
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/stargazers"><img src="https://img.shields.io/github/stars/HsiangNianian/dsh-auto-continue?logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue"><img src="https://img.shields.io/badge/install-dsh__plugin__add-0a0a0a?style=flat" alt="Install with dsh plugin add"></a>
  <br>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=fff" alt="TypeScript">
  <img src="https://img.shields.io/badge/esbuild-FFCF00?style=flat&logo=esbuild&logoColor=000" alt="esbuild">
  <img src="https://img.shields.io/badge/zero__runtime__deps-16a34a?style=flat" alt="Zero runtime dependencies">
</p>

<p align="center">
  <b>English</b> · <a href="README.zh.md">中文</a>
</p>

---

## What It Does

For [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh web`): whenever a request in the web GUI gets interrupted by a **non-human cause**, the plugin simulates the user typing **「继续」** and sends it, so the agent keeps working without manual intervention. The message enters the session log exactly like a manual prompt — the model sees it, and the interrupted work resumes.

It watches the live event streams and reacts to:

| Event | Meaning |
| --- | --- |
| `turn/end` → `error` | Turn failed (model / network / timeout, …) |
| `turn/end` → `interrupted` | Crash-orphaned turn left behind by a host restart |
| `turn/end` → `max-tokens` | Output token ceiling reached |
| `host/agent-error` | Agent failure with no turn position |

**Never auto-continues:** user-aborted turns (`aborted`) or policy rejections (`blocked`); sessions the host already resumed itself; running sessions or sessions with queued messages; subagent sessions; anything inside the cooldown / consecutive-cap windows (below).

---

## How It Works

The plugin opens two extra SSE streams in the browser — `events.mux` (session events) and `events.host` (host events). The host supports multiple consumers, so this never interferes with the built-in runtime. On an interruption it waits a **grace period** (default 3 s) — if the host starts a new turn by itself (`turn/start`), the auto-continue is cancelled — then calls `sessions.prompt` in `queue` mode with 「继续」.

On page load / reconnect it also scans the most recently updated sessions: a session whose last turn ended with a non-human reason **within the last 15 minutes**, with no later `turn/start` or user message, gets resumed automatically too (e.g. the host crashed while the browser was closed).

**Safety guards (defaults):**

| Setting | Default | Description |
| --- | --- | --- |
| `continueText` | `"继续"` | Text to send |
| `graceMs` | `3000` | Wait after an interruption; cancelled if the host recovers on its own |
| `cooldownMs` | `20000` | Min interval between auto-continues per session (failed attempts count too) |
| `maxConsecutive` | `3` | Max consecutive auto-continues; stops until a user intervenes or a turn completes |
| `scanOnBoot` | `true` | Scan recently interrupted sessions on load / reconnect |
| `scanLimit` | `8` | Max sessions scanned (running / subagent sessions excluded) |
| `freshMs` | `900000` (15 min) | Scan only considers interruptions inside this window |
| `reconnectScanDelayMs` | `5000` | Delay before scanning after a reconnect |
| `reconnectBackoffMs` | `3000` | SSE reconnect backoff |
| `verbose` | `true` | `[auto-continue]` console logs |

---

## Quick Start

DSH plugins install into a **profile** (`dsh web` → `web` profile). Install, restart `dsh web`, done.

### From npm (when published)

```bash
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### From this repository

Requires Node.js ≥ 18.

```bash
git clone https://github.com/HsiangNianian/dsh-auto-continue.git
cd dsh-auto-continue
npm install
npm run build

# the package carries its own cordis.patch.yml (dsh.bundle.patch),
# so the plugin row registers itself
dsh plugin --profile web add link:$(pwd)

dsh web
```

### Manual (no pnpm / dsh plugin needed)

```bash
ln -sfn "$(pwd)" ~/.dsh/profiles/node_modules/dsh-client-auto-continue
# then append to ~/.dsh/profiles/web/cordis.patch.yml:
#   - insert:
#       - id: auto-continue
#         name: 'dsh-client-auto-continue'
dsh web
```

> Switching from a manual install to `dsh plugin add`? Remove the manual `insert` entry first — the bundle patch registers the row and a duplicate would conflict.

### Verify & uninstall

```bash
dsh --profile web --dump-config | grep auto-continue   # config layer mounted
```

In the browser console (Ctrl/Cmd+Shift+I): `[auto-continue] 已启动(文本="继续", …)` — every detection and auto-send is logged.

```bash
dsh plugin --profile web remove dsh-client-auto-continue   # npm / repo install
# or remove the symlink + the insert entry                  # manual install
dsh web
```

---

## Configuration

Override any setting via `localStorage` (refresh the page afterwards):

```js
localStorage["dsh-auto-continue.config"] = JSON.stringify({
  continueText: "请继续",
  graceMs: 5000,
  cooldownMs: 30000,
  maxConsecutive: 5,
  verbose: true
});
```

Remove the key to restore defaults:

```js
localStorage.removeItem("dsh-auto-continue.config");
```

---

## Tech Stack & Structure

| Layer | Choice |
| --- | --- |
| Platform | DSH Web GUI client plugin (browser half + no-op host half) |
| Language | TypeScript |
| Build | esbuild (browser bundle + node half) + tsc declarations |
| Runtime deps | **Zero** — all `@deepseek-ai/*` imports are type-only and erased at build |

```
dsh-auto-continue/
├── package.json            # plugin manifest (dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile patch layer: registers the plugin row
├── build.mjs               # esbuild build (browser bundle + node half)
├── tsconfig.json / tsconfig.build.json
├── src/
│   ├── index.ts            # host half entry (no server-side behavior)
│   └── client/index.ts     # browser half: the auto-continue engine
├── tests/simulate.mjs      # headless behavioral tests (mock API)
├── lib/                    # build output (committed, ready to link)
├── docs/                   # banner artwork
└── README.md / README.zh.md / LICENSE
```

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # rebuild on change; host HMR hot-reloads without a page refresh
npm run test        # node tests/simulate.mjs — 7 behavioral scenarios
```

While `npm run watch` runs, the profile's client-hmr row polls `lib/client.js` every 500 ms and hot-reloads the plugin in the browser — no server restart needed for code changes.

---

## Links

- **Repository**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
