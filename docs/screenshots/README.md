# Configuration and composer screenshots

Captured on 2026-10-06 using **DSH 0.2.1-alpha.1** and
the **dsh-client-auto-continue 0.13.0** release build in Chromium, with DSH's dark theme.
These are screenshots of the running application in an isolated `DSH_HOME`
with no user sessions or API keys.

| View | English | Chinese | Viewport |
| --- | --- | --- | --- |
| Plugins → dsh-client-auto-continue, collapsed card | [01-settings-section.png](01-settings-section.png) | [01-settings-section.zh.png](01-settings-section.zh.png) | 1440 × 610 |
| Expanded card, composer visibility, recovery prompts and autonomous loop | [02-settings-card.png](02-settings-card.png) | [02-settings-card.zh.png](02-settings-card.zh.png) | 1440 × 1400 |
| Live status and Save / Discard controls | [07-card-panels.png](07-card-panels.png) | [07-card-panels.zh.png](07-card-panels.zh.png) | 1440 × 950 |
| Native composer switch | [08-composer-toggle.png](08-composer-toggle.png) | [08-composer-toggle.zh.png](08-composer-toggle.zh.png) | 1440 × 900, cropped to the 828 × 256 composer area |

To refresh them, first verify `dsh --version` is `0.2.1-alpha.1`, then create
an empty DSH home and install the released plugin:

```bash
capture_home="$(mktemp -d)"
DSH_HOME="$capture_home" dsh plugin --profile web add dsh-client-auto-continue@0.13.0
DSH_HOME="$capture_home" dsh web --no-open
```

Open the authenticated URL printed by DSH without including that URL in any
screenshot. Dismiss onboarding, select the dark theme, and navigate from the
main sidebar's **Plugins** button.

Capture the collapsed card, expand it for the top-of-page view, then scroll to
its Save / Discard footer. For the composer view, open a new session and crop
the screenshot to the message input and workspace controls. Switch **Settings → General →
Language** to Chinese and wait for the translated interface to finish rendering
before repeating the captures. Use device scale factor 1 and the viewports
above; keep the UI content unchanged.

Before capture, verify that toggling the composer switch updates another open
tab and persists after a reload. Turn off composer visibility in the settings:
it should remain visible until Save, then disappear without changing `paused`.
Reset both overrides before capturing. Wait for the profile writes to finish
before checking the saved file. Keep the form at its defaults and record the
host/plugin versions when updating these images. Also check the switch in the
light theme and at a narrow viewport (393 × 852).
