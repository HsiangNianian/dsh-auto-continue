# Configuration and composer screenshots

Captured on 2026-10-06 with **DSH 0.2.1-alpha.1** and the **current working-tree build**
(the package version remains 0.13.0 until release), using Chromium and DSH's dark theme.
The capture uses an isolated `DSH_HOME` with no API keys or user conversations.

| View | English | Chinese | Viewport |
| --- | --- | --- | --- |
| General category and the inline GitHub invitation | [01-settings-section.png](01-settings-section.png) | [01-settings-section.zh.png](01-settings-section.zh.png) | 1440 × 1100 |
| Retry strategy category | [02-settings-card.png](02-settings-card.png) | [02-settings-card.zh.png](02-settings-card.zh.png) | 1440 × 1400 |
| Status and logs, Save / Discard controls | [07-card-panels.png](07-card-panels.png) | [07-card-panels.zh.png](07-card-panels.zh.png) | 1440 × 1100 |
| Native composer switch | [08-composer-toggle.png](08-composer-toggle.png) | [08-composer-toggle.zh.png](08-composer-toggle.zh.png) | 1440 × 900, cropped to the composer |

To refresh, build the checked-out code and install it in an empty DSH profile:

```bash
npm run build
capture_home="$(mktemp -d)"
DSH_HOME="$capture_home" dsh plugin --profile web add "file:$PWD"
DSH_HOME="$capture_home" dsh web --no-open
```

Open the authenticated URL printed by DSH without including its token in any
screenshot. Dismiss onboarding, select the dark theme, and open **Plugins →
dsh-client-auto-continue** from the sidebar. Capture **General**, **Retry strategy**,
and **Status and logs**. The repository invitation should stay beside the plugin
introduction on one continuous charcoal background, with their vertical centers aligned. There is no collapsed card or
prototype selector in the finished UI.

For the composer view, open a new session without sending a message and crop to
the message input and controls. Use a fresh browser context with an English or
Chinese locale (or change **Settings → General → Language**) and repeat the captures.
Use device scale factor 1. Do not fabricate activity for the statistics panel.

Before capture, verify the composer switch updates another open tab and persists
after reload. Changing its visibility in **General** must remain staged until
Save; hiding it must not change `paused`. Restore both overrides to inherited
values. Verify that navigation preserves drafts, errors in hidden categories are
marked, and read-only settings cannot be edited. Also check light theme and a
393 × 852 viewport: the repository entry condenses and stays beside the introduction.
