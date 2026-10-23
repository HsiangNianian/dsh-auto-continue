# Changelog

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
