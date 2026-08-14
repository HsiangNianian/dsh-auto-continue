# dsh-auto-continue

[中文](README.zh.md)

**DSH Web UI plugin** — when a request in the web GUI gets interrupted by a **non-human cause** (network failure, provider error, host crash, token ceiling), the plugin automatically simulates the user typing **"继续" (continue)** and sends it, so the agent keeps working without manual intervention.

Works with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh web`).

## How it works

The plugin opens two extra live event streams in the browser (the host supports multiple consumers, so this does not interfere with the built-in runtime):

- `events.mux` — session event stream, watching `turn/end`
- `events.host` — host event stream, watching `host/session-status`, `host/agent-error`

When one of the following **non-human interruptions** is detected, the plugin waits a grace period (3 s by default), then calls the host's `sessions.prompt` in `queue` mode with the text **「继续」** — exactly equivalent to the user typing it manually (the message enters the session log and is visible to the model):

| Event | Meaning |
|---|---|
| `turn/end` reason = `error` | Turn failed (model / network / timeout, …) |
| `turn/end` reason = `interrupted` | Crash-orphaned turn left behind by a host restart |
| `turn/end` reason = `max-tokens` | Output token ceiling reached |
| `host/agent-error` | Agent failure with no turn position |

**Never auto-continues:**

- `turn/end` reason = `aborted` (user pressed stop) or `blocked` (policy rejection)
- The host starts a new turn by itself during the grace period (`turn/start`)
- The session is running, or already has queued messages (the host will wake up on its own)
- Subagent sessions (handled by their parent agent)
- Past the consecutive-attempt cap / inside the cooldown window (below)

## Safety guards (defaults)

| Setting | Default | Description |
|---|---|---|
| `continueText` | `"继续"` | Text to send |
| `graceMs` | `3000` | Wait after an interruption; cancelled if the host recovers on its own |
| `cooldownMs` | `20000` | Minimum interval between two auto-continues per session (successes *and* failed attempts count) |
| `maxConsecutive` | `3` | Max consecutive auto-continues per session; stops until a user intervenes or a turn completes |
| `scanOnBoot` | `true` | Scan recently interrupted sessions on page load / reconnect (e.g. host crashed while the browser was closed) |
| `scanLimit` | `8` | Max sessions scanned (most recently updated; running/subagent sessions excluded) |
| `freshMs` | `900000` (15 min) | Only interruptions inside this window are considered by the scan |
| `reconnectScanDelayMs` | `5000` | Delay before scanning after a reconnect (lets the host finish recovering) |
| `reconnectBackoffMs` | `3000` | SSE reconnect backoff |
| `verbose` | `true` | `[auto-continue]` console logs |

### Tuning

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

## Installation

DSH plugins are installed into a **profile** (`dsh web` corresponds to the `web` profile). Install this plugin into the `web` profile, then restart `dsh web`.

### Method 1 — from npm (when published)

```sh
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### Method 2 — from this repository

Requires Node.js >= 18.

```sh
# 1. Clone
git clone https://github.com/HsiangNianian/dsh-auto-continue.git
cd dsh-auto-continue

# 2. Install dependencies and build
npm install
npm run build

# 3. Link into the web profile (the package carries its own cordis.patch.yml
#    via the dsh.bundle.patch manifest, so the plugin row registers itself)
dsh plugin --profile web add link:$(pwd)

# 4. Restart dsh web
dsh web
```

### Method 3 — manual (no pnpm / dsh plugin needed)

```sh
# 1. Symlink the package into the profile's node_modules
ln -sfn "$(pwd)" ~/.dsh/profiles/node_modules/dsh-client-auto-continue

# 2. Append to ~/.dsh/profiles/web/cordis.patch.yml:
#    - insert:
#        - id: auto-continue
#          name: 'dsh-client-auto-continue'

# 3. Restart dsh web
dsh web
```

> If you previously installed manually and later switch to `dsh plugin add`, remove the manual `insert` entry first — the package's own bundle patch will register the row and a duplicate would conflict.

### Verification & uninstall

After a restart, the plugin is live. Confirm with:

```sh
dsh --profile web --dump-config | grep auto-continue
```

In the browser: open the GUI (Ctrl/Cmd+Shift+I console) and check for `[auto-continue] 已启动(文本="继续", …)` — every detection and auto-send is logged there.

Uninstall:

```sh
dsh plugin --profile web remove dsh-client-auto-continue   # Method 1/2
# or remove the symlink + the insert entry                  # Method 3
dsh web
```

## Directory structure

```
dsh-auto-continue/
├── package.json            # plugin manifest (dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile patch layer: registers the plugin row
├── build.mjs               # esbuild build (browser bundle + node half)
├── tsconfig.json           # typecheck settings
├── tsconfig.build.json     # declaration emit → lib/types
├── src/
│   ├── index.ts            # host half entry (no server-side behavior)
│   └── client/
│       └── index.ts        # browser half: the auto-continue engine
├── tests/
│   └── simulate.mjs        # headless behavioral tests (mock API)
├── lib/                    # build output (committed, ready to link)
│   ├── index.js
│   ├── client.js
│   └── types/
├── README.md               # this file
├── README.zh.md            # 中文说明
└── LICENSE                 # MIT
```

## Development

```sh
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # rebuild on change; the host HMR picks it up without a page refresh
npm run test        # node tests/simulate.mjs — 7 behavioral scenarios
```

Notes:

- The browser bundle is built with esbuild and wrapped in the
  `window.__ModuleLoader__.load({ id, factory })` envelope the dsh client
  module system expects; all `@deepseek-ai/*` imports are type-only and are
  erased at build time, so the bundle carries **zero runtime dependencies**.
- Type dependencies resolve from `node_modules/@deepseek-ai` (symlinked to a
  DSH installation's packages for exact version parity); if you have a DSH
  checkout or npm-installed packages available, point the symlink there.
- While `npm run watch` is running, the profile's client-hmr row polls
  `lib/client.js` every 500 ms and hot-reloads the plugin in the browser —
  no server restart needed for code changes.

## License

[MIT](LICENSE)
