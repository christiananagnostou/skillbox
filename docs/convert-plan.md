# Skillbox Add-Convert Plan (Agent-Assisted Conversion)

## Goals
- Keep `skillbox add` as the only entry point for adding skills.
- If a URL is not a valid `SKILL.md`, auto-trigger an agent-assisted conversion flow.
- No DOM parser or scraping dependencies in the CLI.
- Agent handles page fetching, link following, and synthesis.
- CLI validates strict JSON, writes canonical skill files, and installs as normal.
- Update the Skillbox skill to teach agents how to build high-quality skills (Dify patterns).

## User Flow (UX)

### 1) Normal add (unchanged)
```
skillbox add <url>
skillbox add owner/repo
```

### 2) If URL is not a valid SKILL.md
- CLI prints:
  - strict JSON schema
  - detailed agent prompt
  - instructions to run:
```
skillbox add --ingest <json>
```

### 3) Ingest agent JSON
```
skillbox add --ingest <json>
```
- Validates JSON strictly
- Writes to canonical store
- Installs using existing add logic (respecting config default scope / `--global` / `--agents`)

No `--prompt` flag. No separate `convert` command.

## Architecture Changes

### A) Add command enhancements
- `skillbox add <url>`:
  - attempt SKILL.md parse/validate
  - on failure: print conversion prompt + schema
- new option:
  - `--ingest <json>`
    - skip URL fetch
    - load JSON and produce skill files

### B) JSON ingest validation
Introduce a strict schema for agent output:

Required:
- `name` (kebab case)
- `description`
- `body` (markdown)
- `source` `{ type, value }`

Optional:
- `frontmatter` (Claude-allowed keys only)
- `namespace`
- `categories`
- `tags`
- `subcommands`: `{ name, body, frontmatter? }`
- `supporting_files`: `{ path, contents }`

Rules:
- `frontmatter.name` defaults to `name` if omitted.
- Disallow unknown frontmatter keys.
- `subcommands[].name` becomes `<name>.md` in skill root.
- `supporting_files[].path` must be relative, no `../`.

### C) Output structure (canonical store)
```
~/.config/skillbox/skills/<name>/
  SKILL.md
  <subcommand>.md
  supporting_files...
  skill.json
```

### D) Metadata handling
- Skillbox generates `skill.json` from validated ingest JSON.
- Source stored as `{ type: "convert", value: <source.value> }`.
- Include `namespace`, `categories`, `tags` if provided.

### E) Update behavior
- Converted skills treated as local.
- `skillbox update` does not refetch converted skills by default.

## Agent Prompt Content

### Must include:
- Fetch the URL and follow related doc links.
- Summarize into a skill following Claude + Dify patterns.
- Keep SKILL.md concise (<500 lines).
- Put deep detail in `references/`.
- Avoid README, changelog, installation docs.
- Frontmatter description must include "when to use" info.

### Must embed Dify skill-creator principles:
- Concise is key.
- Progressive disclosure patterns.
- Use scripts only for deterministic repetitive tasks.
- Use references for deep docs.
- Avoid extra docs.

## Test Case (Algolia docs)

Example user command:
```
skillbox add https://www.algolia.com/doc
```

Expected agent behavior:
- Fetch the root page.
- Follow relevant sub-links (API reference, guides).
- Build skill with:
  - concise SKILL.md
  - `references/` files for deep docs
  - optional subcommands for specific workflows
- Output strict JSON for ingestion.

## Update skillbox skill (skills/skillbox/SKILL.md)

Add a section that teaches agents:
- conversion flow
- JSON schema basics
- Dify patterns
- how to structure SKILL.md + references + subcommands
- how to avoid bloat

## CLI Messages (draft)
On invalid SKILL.md:
- "This URL does not appear to be a valid skill."
- "Use an agent to extract and return JSON using the schema below."
- "Then run: `skillbox add --ingest <json>`"

## Implementation Steps

1) Schema
- Add validation schema for ingest JSON.
- Validate frontmatter keys and file paths.

2) Add command
- Add `--ingest` option.
- Fallback prompt on invalid SKILL.md.

3) Ingest path
- Build SKILL.md from `frontmatter + body`.
- Write subcommands and supporting files.
- Write `skill.json` via metadata builder.
- Install to agents using existing add logic.

4) Docs
- Update `docs/cli.md` to describe auto convert + `--ingest`.
- Add this plan doc to `docs/`.
- Update Skillbox skill.

5) Tests
- Unit: schema validation.
- CLI: ingest flow.
- Manual: Algolia docs flow.

## Open Decisions (if you want to adjust)
- Fail vs overwrite for existing skill name (default fail).
- Support `--force` (optional).
- Support stdin ingest (optional).
