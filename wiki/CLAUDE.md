# Wiki Conventions

This folder is an Obsidian vault, checked into the repo. `.obsidian/` is
gitignored; `.vault-nickname` names the vault in Obsidian's switcher.

## What goes where

| Kind of knowledge | Destination |
|---|---|
| Formal, user-facing spec | `docs/` (not the wiki) |
| Decisions, rationale, state, half-formed thoughts | `wiki/notes/` |
| External references, summarised for this project | `wiki/research/` |
| What happened today | `wiki/daily/YYYY-MM-DD.md` |
| Session test plans for Taylor to tick through | `wiki/test-plans/` |
| Hand-curated indexes per cluster | `wiki/mocs/` |
| Cross-project tool gotchas | global `~/.claude/memory/` (not here) |

## Naming

- Filenames: lowercase `kebab-case.md`. H1 inside in Title Case.
- Decisions: `notes/decision-*.md` with Context → Decision → Why →
  Constraints carried forward. Link from `mocs/decisions.md`.
- Daily notes: `daily/YYYY-MM-DD.md`, date H1, `##` per work stream.
- Test plans: `test-plans/test-plan-YYYY-MM-DD-topic.md`.

## Linking and tags

- Wikilinks `[[note-name]]`, no extension. Link eagerly: if a concept is
  mentioned twice, make it a note. Never hand-maintain backlinks.
- Frontmatter tags are orthogonal axes only: `domain/*` (1+), `status/*`
  (exactly one: open/draft/adopted/verified/deferred/superseded),
  `origin/*` (0+). Add a tag only if 3+ notes would use it; never mirror
  folder structure as a tag.

## Write triggers

Taylor says "write this down"; a decision is made; a sub-project kicks off;
anything notable happens during work → append to today's daily note.

## On creating a note

1. Wikilink it from the relevant MOC in the same edit.
2. If the MOC doesn't exist, create it and add it to `index.md`.
3. Append `- created [[note-name]]` to today's daily note.
