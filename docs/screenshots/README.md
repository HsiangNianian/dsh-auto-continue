# Configuration and composer screenshots

Captured on 2026-10-23 with **DSH 0.2.1-rc.2** and **plugin 0.17.0**,
using Chromium and DSH's dark theme.
The capture uses an isolated `DSH_HOME` with no API keys or user conversations.

| View | English | Chinese | Viewport |
| --- | --- | --- | --- |
| General category | [01-settings-section.png](01-settings-section.png) | [01-settings-section.zh.png](01-settings-section.zh.png) | 1440 × 977 |
| Retry strategy category | [02-settings-card.png](02-settings-card.png) | [02-settings-card.zh.png](02-settings-card.zh.png) | 1440 × 1372 |
| Status and logs, native Save button | [07-card-panels.png](07-card-panels.png) | [07-card-panels.zh.png](07-card-panels.zh.png) | 1440 × 971 |
| Composer switch and mode menu | [08-composer-toggle.png](08-composer-toggle.png) | [08-composer-toggle.zh.png](08-composer-toggle.zh.png) | 840 × 300, cropped to the composer |

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
and **Status and logs**. The settings card starts with a compact star/repository link row and then the category
navigation; its fields use DSH's native settings primitives. There is no charcoal title banner.
There is no collapsed card or prototype selector in the finished UI.

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

## Issue #72: 584px viewport fallback

Captured on 2026-11-02 in Chromium 153 at a **584 × 740 CSS-pixel** viewport,
cropped to 584 × 240 with device scale factor 1. These are browser reproduction
screenshots, not captures from the reporter's Android device or a running DS-Bot session.

| Version | Screenshot | Controls | Message input |
| --- | --- | --- | --- |
| 0.17.2 | [Before](issue-72-584-before.png) | 194px | 230px |
| 0.17.3 | [After](issue-72-584-after.png) | 77px | 347px |

The fixture renders the real `AutoContinueComposerToggle`, DSH 0.2.1-rc.2's
native switch/menu, and the composer rules from
[DS-Bot 0.2.5](https://github.com/Fei2411/DS-Bot/blob/v0.2.5/ds-bot/src/client/styles.js)
and [dsh-pocket 2.12.0](https://github.com/shaobeichen/dsh-pocket/blob/v2.12.0/client/mobile/mobile.css.ts).
The surrounding composer is a minimal HTML fixture with an editable input;
widths are measured from its DOM. Both captures use the same markup, text and
styles except for the plugin's viewport fallback changing from 460px to 640px.

Browser checks covered 351, 440, 460, 461, 584, 640, 641, 768 and 1024px,
including paused, failed-save, read-only, saving, English, light-theme and
intact-container variants. The compact controls keep their accessible names,
the switch and native mode menu remain interactive, and pause/error text wraps
below the controls through 640px.
