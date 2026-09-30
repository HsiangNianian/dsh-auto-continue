# Configuration screenshots

Captured on 2026-09-30 using **DSH 0.2.0-rc.1** and
**dsh-client-auto-continue 0.12.1** in Chromium, with DSH's dark theme.
These are screenshots of the running application in an isolated `DSH_HOME`
with no user sessions or API keys.

| View | English | Chinese | Viewport |
| --- | --- | --- | --- |
| Plugins → dsh-client-auto-continue, collapsed card | [01-settings-section.png](01-settings-section.png) | [01-settings-section.zh.png](01-settings-section.zh.png) | 1440 × 760 |
| Expanded card, recovery prompts and autonomous loop | [02-settings-card.png](02-settings-card.png) | [02-settings-card.zh.png](02-settings-card.zh.png) | 1440 × 1400 |
| Live status and Save / Discard controls | [07-card-panels.png](07-card-panels.png) | [07-card-panels.zh.png](07-card-panels.zh.png) | 1440 × 950 |

To refresh them, first verify `dsh --version` is `0.2.0-rc.1`, then create
an empty DSH home and install the released plugin:

```bash
capture_home="$(mktemp -d)"
DSH_HOME="$capture_home" dsh plugin --profile web add dsh-client-auto-continue@0.12.1
DSH_HOME="$capture_home" dsh web --no-open
```

Open the authenticated URL printed by DSH without including that URL in any
screenshot. Dismiss onboarding, select the dark theme, and navigate from the
main sidebar's **Plugins** button.

Capture the collapsed card, expand it for the top-of-page view, then scroll to
its Save / Discard footer for the final view. Switch **Settings → General →
Language** to Chinese and wait for the translated interface to finish rendering
before repeating the captures. Use device scale factor 1 and the viewports
above; keep the UI content unchanged.

Before capture, verify that a text change and a numeric change both persist
after Save and a browser reload, then reset those overrides. Wait for the
profile writes to finish before checking the saved file. Keep the form at its
defaults and record the host/plugin versions when updating these images.
