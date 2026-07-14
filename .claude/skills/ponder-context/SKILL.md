---
name: ponder-context
description: "Answers questions about Ponder (ponder-sh/ponder), the TypeScript framework for EVM data indexing — config, schema, indexing functions, GraphQL/SQL query APIs, the sync engine, and production ops. References load on demand from references/."
---

# Context navigator

## Overview

This navigator catalogs references for Ponder (`ponder-sh/ponder`, core package `ponder`). The navigator itself stays small; references load only when relevant to the current question.

When asked a question this navigator's domain covers:

1. Scan the **Catalog** below for the matching topic.
2. Follow the link to read the reference file.
3. If the question spans multiple references, consult the **Cross-reference map**.
4. If a reference points at a source URL for deeper detail, follow it only if the reference itself didn't answer the question.

## Claims policy

Cite by default, and make load-bearing claims verifiable:

1. **Inline-cite every load-bearing claim with its SHA-pinned permalink** — the `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<start>-L<end>` link the reference gives for that fact (versions, defaults, signatures, deprecations, behavior a user could get wrong by guessing). Put the permalink inline, on the claim. Use a bare filename parenthetical (e.g. *(reference-name.md)*) only when the reference genuinely provides no permalink. This inline permalink is what the grounded-citation eval (SELF-AUDIT Check 8) grades.
2. Don't cite orientational prose — *"what is X?"*, *"when did X launch?"* — answer those from this navigator alone; opening a reference is itself a citation gesture.
3. End with a one-line provenance footer, emitted italic, formatted `*References consulted: foo.md, bar.md. Grounded in {{LIBRARY}}@{{VERSION}} — [reference index]({{INDEX_URL}}).*` The footer is a **summary of what you read — not a substitute** for the inline permalinks on the claims. The `{{LIBRARY}}` / `{{VERSION}}` / `{{INDEX_URL}}` tokens are agent-substituted at answer time, so they appear literally in the stamped `SKILL.md`.
4. If no reference was opened, say so in the footer (*"Answered from general knowledge — no {{LIBRARY}} references consulted"*) — never fake it.

The voice is competent and careful — no "as an AI assistant" hedging.

## Catalog

References cover Ponder at commit `c8f6935fb65176c01b40cae9056be704c0e5318e` (core package version `0.16.6`). Start with the overview for orientation, then dive into the topic references.

| Reference | Description |
|---|---|
| [Architecture & overview](references/ponder-sh-ponder-overview.md) | What Ponder is, the RPC→sync→indexing→store→query data flow, monorepo packages, the `core/src` subsystem map, `dev` vs `start`, and standard project layout. Read first. |
| [Config (`ponder.config.ts`)](references/ponder-sh-ponder-config.md) | `createConfig`: chains & transports, contracts, factories (dynamic addresses), accounts, block intervals, database selection, ordering, and defaults. |
| [Schema (`ponder.schema.ts`)](references/ponder-sh-ponder-schema.md) | `onchainTable`, EVM column types (`hex`/`bigint`/`bytes`/`json`), primary keys, relations, `onchainEnum`, and the schema validation rules. |
| [Indexing functions](references/ponder-sh-ponder-indexing.md) | `ponder.on`, the `context` argument (`db`/`client`/`chain`/`contracts`), the store CRUD API, the `event` object, setup events, and determinism/reorg rules. |
| [Query APIs](references/ponder-sh-ponder-query.md) | GraphQL, SQL-over-HTTP, `@ponder/client`, `@ponder/react` hooks, and custom Hono API routes — plus how to choose among them. |
| [Sync engine internals](references/ponder-sh-ponder-sync-internals.md) | Checkpoints, historical backfill, realtime sync & reorg handling, the sync-store RPC cache, the adaptive RPC layer, and runtime ordering. Contributor/debugging view. |
| [CLI & production](references/ponder-sh-ponder-cli-and-production.md) | The `ponder` CLI (`dev`/`start`/`serve`/`db`/`codegen`), `create-ponder`, database schemas & crash recovery, zero-downtime deploys, health checks, env vars, telemetry, and logging. |

## Cross-reference map

*Start here when a question spans subsystems (reference names below map to Catalog rows; follow the Catalog link to open one):*

- **"How do dynamic/factory contracts work end to end?"** — declare them in the **Config** reference (`factory()`), then read child-address discovery in the **Sync engine internals** reference.
- **"Why must my indexing code be deterministic?"** — the rule is in the **Indexing functions** reference; the reorg/rollback machinery that forces it is in the **Sync engine internals** reference.
- **"How does a table I declare become queryable?"** — flows from the **Schema** reference → written via the **Indexing functions** reference → exposed by the **Query APIs** reference.
- **"What does `ordering` change?"** — it's set in the **Config** reference; its effect on checkpoints and cross-chain progress is in the **Sync engine internals** reference; its schema constraint (isolated needs `chainId` in the PK) is in the **Schema** reference.
- **"How do I deploy without downtime?"** — the views pattern and `db` commands are in the **CLI & production** reference; the crash-recovery model behind it is summarized in the **Architecture & overview** reference.

## Markdown style for generated references

Reference files use **soft wrapping**: one paragraph per line, no hard line breaks at fixed column widths. Editors and rendered Markdown reflow at viewport width. Do not insert manual line breaks within a paragraph to keep lines under ~80 columns — that produces mid-sentence breaks in rendered output and makes diffs noisier. Code blocks, tables, bullet lists, and headings follow their own rules; this directive applies to prose paragraphs only.

## Instructions to Claude

When loading a reference file, the path syntax depends on the platform:

* **Claude Code**: Read the reference using the platform-provided skill-directory variable: `Read $CLAUDE_SKILL_DIR/references/<source-slug>-<topic>.md`

* **Claude Desktop**: Read the reference using a relative path; the platform resolves it from the skill's installed location: `Read references/<source-slug>-<topic>.md`

Loading rules:

* Load one reference at a time unless the Cross-reference map says to load both.
* If the primary reference doesn't fully answer the question, follow any source URL pointers it provides for deeper detail.
* Do not eagerly load companion files; only follow companion links when the primary reference says to.
* If the user's question is clearly out of scope for this contextualizer, don't invoke this skill at all.

## Progressive disclosure

References prioritize curated insight over re-specifying upstream sources:

* **Gotchas, cross-system patterns, and "why" context** are kept in the reference (curation value).
* **Exact schemas, API signatures, and parameter lists** are summarized in the reference and linked to their authoritative source via source URLs.

When a reference includes a source URL pointer, follow it only when the reference's own summary didn't cover the question. The contextualizer is optimized for the common case; the upstream source is the long tail.

## Optional SKILL.json sibling

This navigator MAY ship a `SKILL.json` sibling alongside this `SKILL.md` for machine-readable consumers (downstream tools and non-Claude agents that prefer structured metadata to markdown parsing). The sibling is purely opt-in additive — contextualizers without it pass verification unchanged.

When `SKILL.json` is present, the `## Catalog` table above, the SKILL.json `catalog[]` entries, and the `references/<source-slug>-*.md` files on disk must be in three-way correspondence. Entries carrying `"draft": true` in SKILL.json are excluded from this trijection and surface as a one-line summary at verify time. The `skill-json-trijection` named check fires only when SKILL.json is present; absence is a silent-skip pass.
