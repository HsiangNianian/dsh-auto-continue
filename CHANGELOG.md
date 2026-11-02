# Changelog

## [0.17.2](https://github.com/HsiangNianian/dsh-auto-continue/releases/tag/v0.17.2) — 2026-11-02

### Fixed

- Use English for missing or unsupported locales, while preserving Chinese for `zh` and `zh-*`, across host prompts, browser locale synchronization and settings-save notifications ([#73](https://github.com/HsiangNianian/dsh-auto-continue/pull/73), thanks @kesha4)
- Keep host prompts in English when an older tab writes a raw locale such as `ru` after the browser's bounded synchronization attempts are exhausted
- Preserve custom prompt text and the three-write limit per active browser locale

### Maintenance

- Rebuild source maps with LF source content and enforce LF text checkouts for consistent builds across platforms
- Add regression coverage for missing and unsupported locales, Chinese regional tags, mixed client versions and localized save notifications

[Upgrade instructions, validation and known limits](docs/releases/v0.17.2.md) · [Full changes](https://github.com/HsiangNianian/dsh-auto-continue/compare/v0.17.1...v0.17.2)

## [0.17.1](https://github.com/HsiangNianian/dsh-auto-continue/releases/tag/v0.17.1) — 2026-10-30

### Fixed

- Keep the mobile composer compact with DS-Bot and dsh-pocket, even when the host's size query container is removed, so the controls leave room for typing ([#72](https://github.com/HsiangNianian/dsh-auto-continue/issues/72))
- Wrap pause notices and legacy save errors below the controls on narrow screens, preserving the original switch, mode menu and accessible labels
- Include the rollback fix first shipped in 0.17.1-rc.1: skip `message-ops` maintenance turns in silent recovery, autonomous followups and startup scans, and cancel automatic sends queued before a rollback ([#69](https://github.com/HsiangNianian/dsh-auto-continue/issues/69))
- Keep maintenance turns out of recovery statistics and retry-budget resets, including unfinished maintenance windows found after a restart
- Treat missing prompt template variables as permanent configuration failures when error classification is enabled, avoiding retries that cannot reach the model

### Maintenance

- Include the native settings form, maintenance-turn, configuration-error and stable/prerelease publishing regression coverage added since 0.17.0
- Keep stable releases on `latest` and prereleases on `next`, with reviewed release notes for both

[Upgrade instructions, validation and known limits](docs/releases/v0.17.1.md) · [Full changes](https://github.com/HsiangNianian/dsh-auto-continue/compare/v0.17.0...v0.17.1)

## [0.17.1-rc.1](https://github.com/HsiangNianian/dsh-auto-continue/releases/tag/v0.17.1-rc.1) — 2026-10-27

Pre-release patch, available on the `next` dist-tag

### Fixed

- Stop `@240xu/dsh-message-ops` rollback notices from triggering silent recovery or autonomous followups, and cancel sends queued before the rollback ([#69](https://github.com/HsiangNianian/dsh-auto-continue/issues/69))
- Exclude those maintenance turns from recovery statistics and retry-budget resets, as well as startup recovery of loaded and stored sessions, including unfinished maintenance windows
- Treat missing prompt template variables as permanent configuration failures when error classification is enabled, avoiding repeated attempts that cannot reach the model

### Maintenance

- Publish prereleases to `next` on npm and GitHub Packages, and mark GitHub Releases as prereleases without replacing the latest stable release
- Add regression coverage for maintenance turns, startup scans, configuration errors and prerelease publishing, alongside the native settings form tests added since 0.17.0

[Upgrade instructions, validation and known limits](docs/releases/v0.17.1-rc.1.md) · [Full changes](https://github.com/HsiangNianian/dsh-auto-continue/compare/v0.17.0...v0.17.1-rc.1)

## [0.17.0](https://github.com/HsiangNianian/dsh-auto-continue/releases/tag/v0.17.0) — 2026-10-23

### Added

- Restore the compact auto-continue switch beside the message input, now with a refresh icon and a native mode menu that shows the current mode
- Show one delayed toast when the host stays unavailable for three seconds, without flashing on a normal page load
- Localize the plugin title and description through `locale` metadata

### Changed

- Collapse the label to its icon and the mode menu to its arrow with the same composer container query as the native permission picker, keeping the switch and menu on one line on phones
- Report session-mode save failures with the host's toast instead of inline red composer text; saving and disconnected states now rely on the disabled controls and their tooltip
- Keep the switch and mode menu disabled while saving, disconnected or read-only, with keyboard access to the mode menu
- Keep the switch scoped to the current conversation, with Follow default selected when switching back on
- Move the settings fields, switches and default-mode selector onto DSH's native `SettingsForm`, `SettingsValueField`, `Switch` and `SegmentedControl` primitives, keeping the legacy card for older hosts
- Remove the charcoal header banner; keep the GitHub invitation as a lightweight link row

### Fixed

- Avoid the composer's invisible select styles leaking onto the settings card's **Default session mode** select, which made clicks anywhere open a full-screen selector until a reload

## [0.16.0](https://github.com/HsiangNianian/dsh-auto-continue/releases/tag/v0.16.0) — 2026-10-23

### Added

- Choose **Off**, **Recovery only** or **Autonomous loop** for each conversation from the control beside the message input, or use **Follow default** to inherit the profile setting ([#67](https://github.com/HsiangNianian/dsh-auto-continue/issues/67), [#68](https://github.com/HsiangNianian/dsh-auto-continue/pull/68))
- Save conversation modes on the host so they survive restarts and sync across tabs, with English and Chinese labels

### Changed

- The composer control now changes only the current conversation, while **Enable auto-continue globally** and **Default session mode** live in the plugin settings
- Existing global pause and autonomous-loop preferences remain in effect for conversations following the default
- Switching a conversation Off cancels pending automatic sends and excludes it from the loop guard, while leaving any current turn running
- Switching from Autonomous loop to Recovery only cancels pending autonomous followups, and re-enabling a mode does not revive cancelled sends
- **Resume now** still requests one manual followup while paused or Off without changing the saved mode

### Fixed

- Avoid duplicate settings namespaces on hosts exposing both legacy and profile settings APIs, addressing the `settings/conflict` save failure reported in [#64](https://github.com/HsiangNianian/dsh-auto-continue/issues/64) ([#65](https://github.com/HsiangNianian/dsh-auto-continue/pull/65))
- Import old auto-continue settings from `settings-legacy.yaml` once per profile, keeping explicit profile values and concurrent edits, leaving the source file untouched and preventing old values from returning after a full settings reset
- Hold automatic recovery and the loop guard while a required settings import is pending or fails, without waiting for an editor when there is nothing to import
- Keep legacy YAML source text out of parser warnings and errors, and retain the bundled parser's ISC license

### Maintenance

- Align the DSH development packages on `0.1.2-rc.1`, Cordis on `4.0.2` and Schemastery on `3.18.2`, removing the mixed dependency versions left by a partial update ([#66](https://github.com/HsiangNianian/dsh-auto-continue/pull/66))
- Add regression coverage for conversation modes, delayed sends, settings persistence and migration failures
- Publish GitHub release bodies from checked-in notes and fail before publishing if the notes file is missing or empty

[Upgrade instructions, validation and known limits](docs/releases/v0.16.0.md) · [Full changes](https://github.com/HsiangNianian/dsh-auto-continue/compare/v0.15.0...v0.16.0)

## Earlier releases

Release notes for v0.15.0 and earlier are available on [GitHub Releases](https://github.com/HsiangNianian/dsh-auto-continue/releases)
