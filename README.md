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
  <a href="https://www.npmjs.com/package/dsh-client-auto-continue"><img src="https://img.shields.io/npm/v/dsh-client-auto-continue?logo=npm&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-client-auto-continue"><img src="https://img.shields.io/npm/dm/dsh-client-auto-continue?label=downloads" alt="npm downloads"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/stargazers"><img src="https://img.shields.io/github/stars/HsiangNianian/dsh-auto-continue?logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome · DSH plugin"></a>
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

![demo](docs/demo.svg)

**Smart recovery** (all configurable):

- **Error classification** — transient failures (network / timeout / 5xx / 429…) are auto-resumed; permanent ones are **skipped** and notified, because retrying them never helps. A failure counts as permanent when its HTTP status is 401/403 or its code/message matches auth, credential/API-key, balance/quota, unknown-model, or context-length/overflow keywords. Turn classification off to resume everything
- **Adaptive backoff** — consecutive failures wait longer each time (cooldown × factor: 20s → 40s → 80s…), capped at the max backoff, instead of hammering a broken upstream
- **Templated continue text** — `continueText` supports `{code}` `{message}` `{status}` `{tool}` `{turn}` `{errorCount}` `{sessionTitle}` `{elapsed}` placeholders, so the resume message can carry the failure context ("继续 (git push failed: UPSTREAM)"); a **separate template** fires on `max-tokens` (e.g. "继续输出, 不要重复已生成的内容")
- **Idempotency guard** — before resuming, the plugin inspects the last tool call: if its result is unconfirmed (the turn died mid-tool, e.g. a `git push` that may have gone through), the resume message tells the model to check state first and not to rerun; if the tool is confirmed done, it says so and asks not to repeat it; a failed tool gets no guard (retrying it is the point). Both guard texts are configurable (`{tool}` / `{result}` placeholders)
- **Pause** — a global **Pause auto-continue** toggle in the settings card stops everything (live + scan) instantly; per-session pauses (e.g. via a notification button) suspend only one session until they expire. The **Resume now** notification button is the one explicit exception: pressing it is the user asking for exactly one send, pause or not
- **Notification buttons** — notifications carry **Resume now** (send immediately, ignoring cooldown, the consecutive cap and any pause) and **Pause this session 1h** actions
- **Loop guard** — watches **running** turns too. Three signals trip the guard, which cancels the turn and restarts it with a configurable loop text ("stop repeating, try another way"): the model repeating the **exact same message** several times (any length — e.g. "Let me test variants of the regex…" ×7), many short messages inside a short time window with no tool call in between (the "Let me read…" spin), or the same tool called repeatedly with the **same arguments and the same results** (a changed argument or result counts as progress). The cancel carries an internal marker so it is never confused with a user stop — the restart only happens for guard-initiated cancels. Thresholds, the time window and the loop text are configurable
- **Stats panel** — the settings card shows today's auto-continue count, recoveries, failures, permanent skips, give-ups and loop breaks, broken down by error code, with a one-click reset
- **Browser notifications** — optional alerts when auto-continue fires, gives up, or hits a permanent error; the browser asks for permission on first use, and nothing is shown again after a denial

It watches the live event streams and reacts to:

| Event | Meaning |
| --- | --- |
| `turn/end` → `error` | Turn failed (model / network / timeout, …) |
| `turn/end` → `interrupted` | Crash-orphaned turn left behind by a host restart (recovered by the startup scan) |
| `turn/end` → `max-tokens` | Output token ceiling reached |
| `host/agent-error` | Agent failure with no turn position (only network/timeout-class messages auto-resume) |

**Never auto-continues:** user-aborted turns (`aborted`) or policy rejections (`blocked`); live `interrupted` turn-ends too — that marker is only written by crash repair when the host reloads, so orphaned turns are recovered by the startup scan, not the live path; sessions the host already resumed itself; running sessions or sessions with queued messages; subagent sessions; anything inside the cooldown / consecutive-cap windows (configurable in the settings card, below).

---

## How It Works

The plugin opens two extra SSE streams in the browser — `events.mux` (session events) and `events.host` (host events). The host supports multiple consumers, so this never interferes with the built-in runtime. On an interruption it waits a **grace period** (default 3 s) — if the host starts a new turn by itself (`turn/start`), the auto-continue is cancelled — then calls `sessions.prompt` in `queue` mode with the configured text.

On page load / reconnect it also scans the most recently updated sessions: a session whose last turn ended with a non-human reason **within the scan window** (default 15 minutes), with no later `turn/start` or user message, gets resumed automatically too (e.g. the host crashed while the browser was closed).

With the page open in several tabs, a localStorage mutex plus a shared per-session cooldown stamp guarantee exactly one tab sends — no duplicated 「继续」.

All knobs live in the plugin's settings card — see [Configuration](#configuration).

---

## Quick Start

DSH plugins install into a **profile** (`dsh web` → `web` profile). Install, restart `dsh web`, done.

> **Requires DSH ≥ 0.1.0-rc.7** — newer versions register the settings card through the keyed `settings.plugin.item` slot; on rc.6 and earlier the plugin fails to load (`list slot ... requires options.id`). Upgrade dsh first.

### From npm (recommended)

Published as [`dsh-client-auto-continue`](https://www.npmjs.com/package/dsh-client-auto-continue):

```bash
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### Directly from GitHub (no clone needed)

Installs straight from the repository's default branch — built artifacts are committed, so no local clone or build step:

```bash
dsh plugin --profile web add github:HsiangNianian/dsh-auto-continue
dsh web
```

> This tracks the `main` branch rather than released tags — great for trying the latest changes, while the npm method above is the stable choice. Switching between install sources is just re-running `dsh plugin --profile web add <other-spec>`; the profile dependency is replaced in place.

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

> **Settings exposure:** since DSH 0.1.0-rc.7 the web settings surface is **registry-driven** — every namespace a plugin registers is served, so the settings card works out of the box, no vendor patch needed (the plugin requires rc.7+, see Quick Start).

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

Everything is configurable from the GUI — no file or console edits needed. Open **Settings → Plugins** and find the **dsh-client-auto-continue** configuration card, right where every other plugin's config lives. Besides the fields below, the card shows a live **stats panel** (today's activity with a reset button) and the list of **paused sessions** (each with a per-session resume button).

**Or skip the GUI and edit the config file directly** — the engine reads the plugin's section from `~/.dsh/settings.yaml` (one shared file for every plugin's sections), so this works in any install, patched or not. The file is watched and re-read automatically, so changes apply live; restart `dsh web` if a page that was already open doesn't pick them up. Fields you leave out fall back to the defaults in the table below:

```yaml
auto-continue:
  paused: false
  continueText: '继续'
  continueTextMaxTokens: '继续'
  guardTools: true
  guardPendingText: '(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)'
  guardDoneText: '(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)'
  graceMs: 3000
  cooldownMs: 20000
  maxConsecutive: 3
  scanOnBoot: true
  scanLimit: 8
  freshMs: 900000
  reconnectScanDelayMs: 5000
  reconnectBackoffMs: 3000
  verbose: true
  classify: true
  backoffFactor: 2
  backoffMaxMs: 300000
  notify: false
  loopGuard: true
  loopShortChars: 40
  loopWindowMs: 30000
  loopShortCount: 12
  loopRepeatText: 4
  loopToolRepeat: 5
  loopText: '(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)'
```

**How the card works:**

![Stats & paused sessions](docs/screenshots/07-card-panels.png)

- Edits are **staged** — nothing reaches the disk until you hit **Save**; an unsaved badge marks the card while drafts are pending, and **Discard** drops them
- A field you changed shows an **Overridden** badge with a per-field **Reset to default** button that restores the built-in value
- Boolean fields are **tri-state**: *Inherit* (use the default) / *On* / *Off*
- Invalid drafts (non-numbers, values below the minimum) block the save with a hint
- In a read-only deployment the card shows the stored values but disables every control
- Changes apply immediately after Save and persist in `~/.dsh/settings.yaml` (uninstalling the plugin leaves the section behind — harmless, delete it by hand if you like)

| Field | Default | Description |
| --- | --- | --- |
| Pause auto-continue | `off` | Global pause: no live or scan auto-send fires, queued pending sends are cancelled |
| Continue text | `继续` | Text automatically sent after an interruption |
| Continue text (max tokens) | `继续` | Text sent when the output token ceiling is reached (same placeholders) |
| Idempotency guard | `on` | Inspect the last tool call before resuming and steer the model (see What It Does) |
| Loop guard | `on` | Detect a running turn spinning in place and restart it (see What It Does) |
| Short-sentence max (chars) | `40` | A model message shorter than this counts as a short sentence (spinning signal) |
| Short-sentence window (ms) | `30000` | Consecutive short sentences must land inside this window; normal thinking spread over time is not misjudged |
| Short-sentence threshold | `12` | Consecutive short sentences inside the window, with no tool call in between, trip the loop guard |
| Identical message count | `4` | Consecutive identical messages (any length) trip the loop guard — the strongest spinning signal |
| Same-tool repeat count | `5` | Consecutive calls of the same tool with identical arguments and results trip the loop guard |
| Loop text | `(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)` | Text sent after the loop guard restarts a turn; `{tool}` placeholder |
| Guard text (unconfirmed result) | `(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)` | Appended when the last tool may have partially executed; `{tool}` placeholder |
| Guard text (tool succeeded) | `(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)` | Appended when the last tool is confirmed done; `{tool}` / `{result}` placeholders |
| Grace period (ms) | `3000` | Wait after an interruption; cancelled if the host recovers on its own |
| Cooldown (ms) | `20000` | Min interval between auto-continues per session (failed attempts count too) |
| Max consecutive | `3` | Max consecutive auto-continues; stops until a user intervenes or a turn completes |
| Scan on load / reconnect | `on` | Scan recently interrupted sessions on load / reconnect |
| Scan limit | `8` | Max sessions scanned (running / subagent sessions excluded) |
| Scan window (ms) | `900000` | Scan only considers interruptions inside this window |
| Reconnect scan delay (ms) | `5000` | Delay before scanning after a reconnect |
| Reconnect backoff (ms) | `3000` | SSE reconnect backoff |
| Verbose logs | `on` | `[auto-continue]` console logs |
| Classify errors | `on` | Auto-resume transient failures only; auth / balance / model errors are skipped and notified |
| Backoff factor | `2` | Cooldown multiplier per consecutive failure (2 = 20s → 40s → 80s…) |
| Max backoff (ms) | `300000` | Cap on the adaptive backoff interval |
| Browser notifications | `off` | Notify when auto-continue fires, gives up, or hits a permanent error |

`continueText` (and `continueTextMaxTokens`) accept the placeholders `{code}`, `{message}`, `{status}`, `{tool}` (last tool call before the failure), `{turn}`, `{errorCount}` (consecutive failures including this one), `{sessionTitle}` (from the session list) and `{elapsed}` (time since the failure, e.g. `1m5s`) — e.g. `继续 ({tool}: {code})` becomes `继续 (git push: UPSTREAM)`. The guard texts accept `{tool}` and `{result}` (a truncated excerpt of the last tool output).

---

## Privacy & permissions

The plugin is browser-only and touches **no files, credentials, or network beyond the dsh host**:

- It opens the same two read-only event streams the web UI already uses (no extra server, no third-party endpoints)
- The engine's **only automatic write** is `sessions.prompt` — the same call the Send button makes — with the text you configured (saving the settings card writes the `auto-continue` section of `~/.dsh/settings.yaml` through the normal settings API, exactly like any other setting)
- Browser storage is limited to small `localStorage` keys: cross-tab coordination stamps, per-session pauses, and the daily stats counters
- Browser notifications are opt-in (`notify` setting) and permission is requested on first use only

---

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # rebuild on change; host HMR hot-reloads without a page refresh
npm run test        # node tests/simulate.mjs — 38 behavioral scenarios
```

While `npm run watch` runs, the profile's client-hmr row polls `lib/client.js` every 500 ms and hot-reloads the plugin in the browser — no server restart needed for code changes.

CI runs [dsh-plugin-check](https://github.com/omdsh-dev/dsh-plugin-check) on every push to `main` and every pull request, and gates releases — the tag workflow refuses to publish while the check fails.

---

## Activity

[![HsiangNianian/dsh-auto-continue GitStock K-Line Chart](https://gitstock.org/HsiangNianian/dsh-auto-continue/stock.svg)](https://gitstock.org/HsiangNianian/dsh-auto-continue)

---

## Links

- **Repository**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **LINUX DO**: [linux.do](https://linux.do)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **dsh-plugin-check**: [github.com/omdsh-dev/dsh-plugin-check](https://github.com/omdsh-dev/dsh-plugin-check) — health-check your own DSH plugin repos

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
