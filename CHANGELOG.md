# Changelog

All notable changes to Decay are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- One lifecycle for everything you write: **firing** (locked until it cools, open to additions),
  **living**, **fading**, **soil**. Nothing is deleted at any stage.
- Vitality from three inputs only — recency, reopens, links — deterministic and bounded 0..100.
  A note reopened five times scores strictly higher than one never opened (asserted).
- The rot: a note whose vitality falls below the threshold leaves the living view and appears in
  the soil (asserted), and the tick reports what it moved.
- Search across living notes and soil, so a word only a composted note holds is still found.
- Re-seeding that returns a note to the living view with its links intact, and a deterministic
  spore that resurfaces a buried note.
- The Kiln half: a firing time that never comes due is refused, one that would cool in the past is
  refused with the date shown, a firing note cannot be acted on (or reopened) but can accrue
  additions, and it takes none after it cools.
- Corruption handling: an unreadable colony is reported, offered for export, and never treated as
  an empty one. The rot does not run on a store it could not write.
- PWA shell, CI (89 engine assertions + 38 in jsdom + page smoke), and the app-builder pipeline
  pinned to the canonical SHA for the EXE/APK/Linux release.

### Not built
- Inferred links: no embedding model exists in this estate, so links are explicit.
