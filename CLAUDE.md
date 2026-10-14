# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — Vite dev server on port 8000, opens `/demo/`, runs `vite build --watch` in parallel.
- `npm run build` — Production build via Vite library mode → `dist/widget-value.js` (ES only).
- `npm run watch` — Rebuild on changes without dev server.
- `npm run types` — Regenerate `src/definition-schema.d.ts` from `src/definition-schema.json` using `json2ts`. Run this after editing the JSON schema.
- `npm run analyze` — Generate custom-elements manifest (LitElement).
- `npm run release` — `npm version patch`: preflight guards (on `main`, clean tree, not behind `origin/main`, generated files current, build passes), then the bump and a `dist/` rebuild (the `version` hook, so the local build registers the new tag), then commit, bare-semver tag, `git push --follow-tags`, then waits on the CI run and fails if the npm publish fails. `npm run release:minor` / `release:major` for other bumps.
- `npm run link` / `npm run unlink` — Symlink the built package into a sibling `../RESWARM/frontend` checkout for local integration testing.

No test runner or lint script is wired into npm scripts (eslint/prettier are devDependencies; no `test` script exists).

Node `>=24.9.0`, npm `>=10.0.2` (per `engines`).

## Architecture

This is a single-file LitElement web component published as `@ironflock/widget-value`, designed to be embedded in IronFlock/RESWARM dashboards.

**Entry point:** `src/widget-value.ts` defines `<widget-value-versionplaceholder>`. The literal string `versionplaceholder` is rewritten at build time by `@rollup/plugin-replace` (configured in `vite.config.ts`) to the current `package.json` version, so each published version registers a uniquely versioned custom-element tag (e.g. `widget-value-1.1.25`). Consumers pick a version by importing it and using the matching tag — multiple versions can coexist on one page. The `demo/index.html` builds the tag dynamically via `unsafeStatic` from `package.json`.

**Platform integration:** the host platform passes two reactive `@property({ type: Object })` inputs:
- `inputData: ValueDisplayConfiguration` — shape declared in `src/definition-schema.json` and code-generated to `src/definition-schema.d.ts` via `npm run types`. The JSON schema is the source of truth; descriptions inside it drive the platform's config UI and AI agent tooling. `dataDrivenDisabled` and `condition` keys in the schema control which fields the platform exposes for data-binding vs static config.
- `theme: { theme_name, theme_object }` — sample themes in `demo/themes/`. The component also reads CSS custom properties `--re-text-color` and `--re-tile-background-color` from its host context (these win over `theme_object`). See `registerTheme()`. These are not snapshotted: `registerTheme()` stores a `var(--re-…, <theme value>)` chain, so a change to the host property repaints the tile live without the widget being told.

**Data flow inside the widget:**
1. `update()` calls `transformData()` whenever `inputData` changes, building `this.dataSets: Map<label, Dataseries>`.
2. When `multiChart` is true, a series is split into one entry per distinct `pivot` value in `data[]`; otherwise a single entry uses the static `value`. `needleValue` is the average of the most recent `advanced.averageLatest` rows; if the newest row's `tsp` is older than `advanced.maxLatency` seconds, `needleValue` becomes `undefined` (stale data hidden).
3. `updated()` then runs `sizingSetup()` + `applyData()`. The component renders an offscreen `.sizing-container` to measure natural box dimensions, then computes a grid layout and uniform scale (`modifier`) that maximises occupied area in `.value-container` for the current host size. A `ResizeObserver` re-runs `applyData()` on resize. Font sizes for label / value / unit are set inline based on `modifier`.

**Build pipeline:** Vite library build (`build.lib`) emits a single ES module with sourcemaps and a copyright banner. `tslib` is aliased to its ES6 entry; `process.env.NODE_ENV` is hard-defined to `production`. There is no bundler-level externalisation — `lit` is bundled in.

## Schema editing workflow

When changing widget configuration: edit `src/definition-schema.json`, run `npm run types`, and update consumers in `widget-value.ts`. Descriptions in the JSON schema are user/agent-facing and intentionally verbose — preserve that style.

## `aiSelection` in `src/definition-schema.json`

The schema root carries an `aiSelection` block next to `title` and `description`. It is **not** JSON Schema and describes no config field — it exists so the IronFlock AI's Widget Builder can pick the right widget for a given shape of data, using knowledge only the widget author has:

```jsonc
"aiSelection": {
  "dataShape": "…what columns this widget consumes and what each one means…",
  "useWhen":   ["…a situation, naming the properties that express it…"],
  "notFor":    ["…a situation this widget is wrong for, naming the widget to use instead…"]
}
```

It is inert everywhere else, and must stay that way: `json2ts` ignores it (the generated `.d.ts` is byte-identical with and without it), the dashboard config editor renders only `schema.properties`, and the AI service's `validate_widget` validates *configs* against the schema, skipping unknown Draft-7 keywords.

When maintaining it:

- `notFor` is the high-value half and the part plain descriptions always omit. Every entry must name the widget that *should* be used, or it rejects without routing.
- Write for an LLM with no other documentation: describe the visible result and the user's intent, not the implementation.
- Prefer entries that discriminate against a *neighbouring* widget. Generic rejections are cheap; the ones that pay are those an author could plausibly get wrong.
- The `notFor` lists are a set across all `widget-*` repos and are meant to be reciprocal — if this widget routes to another for some case, that widget should usually route back for the converse. Changing one side is a cue to check the other.
- Update it whenever a property changes what this widget can *do*, not just how it looks.
