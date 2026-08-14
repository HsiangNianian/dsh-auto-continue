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
  <img src="https://img.shields.io/badge/GUI--configurable-0ea5e9?style=flat" alt="GUI configurable">
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

**Never auto-continues:** user-aborted turns (`aborted`) or policy rejections (`blocked`); sessions the host already resumed itself; running sessions or sessions with queued messages; subagent sessions; anything inside the cooldown / consecutive-cap windows (configurable in the settings card, below).

---

## How It Works

The plugin opens two extra SSE streams in the browser — `events.mux` (session events) and `events.host` (host events). The host supports multiple consumers, so this never interferes with the built-in runtime. On an interruption it waits a **grace period** (default 3 s) — if the host starts a new turn by itself (`turn/start`), the auto-continue is cancelled — then calls `sessions.prompt` in `queue` mode with the configured text.

On page load / reconnect it also scans the most recently updated sessions: a session whose last turn ended with a non-human reason **within the scan window** (default 15 minutes), with no later `turn/start` or user message, gets resumed automatically too (e.g. the host crashed while the browser was closed).

All knobs live in the plugin's settings card — see [Configuration](#configuration).

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

> **Known DSH limitation (0.1.0-rc.6):** the web plugin-configuration section only
> exposes settings namespaces on a hardcoded allowlist in the installed
> `@deepseek-ai/dsh-host-apiproxy` bundle. To make the settings card appear, run
> the idempotent vendor patch once (re-run it after reinstalling dsh):
>
> ```sh
> node scripts/patch-expose.mjs
> dsh web
> ```
>
> The auto-continue engine itself works without this patch — it only gates the
> GUI settings card.

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

Everything is configurable from the GUI — no file or console edits needed. Open **Settings → Plugin configuration** and find the **Auto continue** card. Changes are staged and written on **Save**, apply immediately, and persist in `~/.dsh/settings.yaml`.

| Field | Default | Description |
| --- | --- | --- |
| Continue text | `继续` | Text automatically sent after an interruption |
| Grace period (ms) | `3000` | Wait after an interruption; cancelled if the host recovers on its own |
| Cooldown (ms) | `20000` | Min interval between auto-continues per session (failed attempts count too) |
| Max consecutive | `3` | Max consecutive auto-continues; stops until a user intervenes or a turn completes |
| Scan on load / reconnect | `on` | Scan recently interrupted sessions on load / reconnect |
| Scan limit | `8` | Max sessions scanned (running / subagent sessions excluded) |
| Scan window (ms) | `900000` | Scan only considers interruptions inside this window |
| Reconnect scan delay (ms) | `5000` | Delay before scanning after a reconnect |
| Reconnect backoff (ms) | `3000` | SSE reconnect backoff |
| Verbose logs | `on` | `[auto-continue]` console logs |

---

## Tech Stack & Structure

| Layer | Choice |
| --- | --- |
| Platform | DSH Web GUI client plugin (browser half + host half registering the settings namespace) |
| Language | TypeScript |
| Build | esbuild (browser bundle + node half) + tsc declarations |
| Runtime deps | Browser bundle: `react` (platform seed) + `createSnapshotStore` (module table); host half: `schemastery` + `dsh-settings` (resolved from the dsh installation) |

```
dsh-auto-continue/
├── package.json            # plugin manifest (dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile patch layer: registers the plugin row
├── build.mjs               # esbuild build (browser bundle + node half)
├── tsconfig.json / tsconfig.build.json
├── src/
│   ├── index.ts            # host half: registers the auto-continue settings namespace
│   └── client/
│       ├── index.ts        # browser half entry: engine + settings card wiring
│       ├── engine.ts       # the auto-continue engine (reads the settings scope)
│       ├── settings-card.tsx / settings-form.ts / locales.ts / styles.ts
│       └──                 # settings card UI (staged form, zh/en copy, theme styles)
├── tests/simulate.mjs      # headless behavioral tests (mock API + settings scope)
├── lib/                    # build output (committed, ready to link)
├── docs/                   # banner artwork (en + zh)
└── README.md / README.zh.md / LICENSE
```

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # rebuild on change; host HMR hot-reloads without a page refresh
npm run test        # node tests/simulate.mjs — 8 behavioral scenarios
```

While `npm run watch` runs, the profile's client-hmr row polls `lib/client.js` every 500 ms and hot-reloads the plugin in the browser — no server restart needed for code changes.

---


## Publishing

Tagging `v<version>` (matching `package.json`) triggers the publish workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The CI (`.github/workflows/publish.yml`) then:

1. Verifies the tag matches `package.json` version
2. Installs dependencies, builds (`npm run build`) and runs the test suite
3. Publishes the package to npm (`dsh-client-auto-continue`)
4. Creates a GitHub Release with the packed tarball and built artifacts
   (`lib/client.js`, `lib/client.js.map`, `lib/index.js`) attached

The workflow requires the `NPM_TOKEN` repository secret (an npm automation
token with publish scope):

```bash
gh secret set NPM_TOKEN --repo HsiangNianian/dsh-auto-continue
```

---

## Links


- **Repository**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
