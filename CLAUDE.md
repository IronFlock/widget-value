# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — Vite dev server on port 8000, opens `/demo/`, runs `vite build --watch` in parallel.
- `npm run build` — Production build via Vite library mode → `dist/widget-value.js` (ES only).
- `npm run watch` — Rebuild on changes without dev server.
- `npm run types` — Regenerate `src/definition-schema.d.ts` from `src/definition-schema.json` using `json2ts`. Run this after editing the JSON schema.
- `just lint` — what the CI gate checks besides the build: regenerating the committed generated files (`npm run types`) changes nothing. `just build` = `npm run build`.
- `just merge` / `just release-patch` (`release-minor`, `release-major`) — pull requests into `main` from a feature branch with everything committed: a no-release one, or a release one whose merge publishes to npm in CI (`.github/workflows/build-publish.yml`), then the release GitHub App tags the bare version and creates the GitHub release. Never `npm publish`, tag or edit the version by hand.
- `npm run link` / `npm run unlink` — Symlink the built package into a sibling `../RESWARM/frontend` checkout for local integration testing.

No test runner or lint script is wired into npm scripts (eslint/prettier are devDependencies; no `test` script exists).

Node `>=24.9.0`, npm `>=10.0.2` (per `engines`).

## Architecture

This is a single-file LitElement web component published as `@ironflock/widget-value`, designed to be embedded in IronFlock/RESWARM dashboards.

**Entry point:** `src/widget-value.ts` defines `<widget-value-versionplaceholder>`. The literal string `versionplaceholder` is rewritten at build time by `@rollup/plugin-replace` (configured in `vite.config.ts`) to the current `package.json` version, so each published version registers a uniquely versioned custom-element tag (e.g. `widget-value-1.1.25`). Consumers pick a version by importing it and using the matching tag — multiple versions can coexist on one page. The `demo/index.html` builds the tag dynamically via `unsafeStatic` from `package.json`.

**Platform integration:** the host platform passes two reactive `@property({ type: Object })` inputs:
- `inputData: ValueDisplayConfiguration` — shape declared in `src/definition-schema.json` and code-generated to `src/definition-schema.d.ts` via `npm run types`. The JSON schema is the source of truth; descriptions inside it drive the platform's config UI and AI agent tooling. `dataDrivenDisabled` and `condition` keys in the schema control which fields the platform exposes for data-binding vs static config.
- `theme: { theme_name, theme_object }` — sample themes in `demo/themes/`. The component also reads the CSS custom property `--re-text-color` from its host context (it wins over `theme_object`). See `registerTheme()`. These are not snapshotted: `registerTheme()` stores a `var(--re-…, <theme value>)` chain, so a change to the host property repaints the tile live without the widget being told. The widget paints no background of its own: studio's `widget-item` already paints `--re-tile-background-color` on the tile, and painting it again here composited a translucent tile colour twice.

**Data flow inside the widget:**
1. `update()` calls `registerTheme()` on a theme change (and before the first render) and `transformData()` whenever `inputData` changes, building `this.dataSets: Map<label, Dataseries>`. `transformData()` never writes to `inputData`: the host shares it with other tiles (a frozen config used to throw on `advanced.averageLatest = 1`). Null list slots, null rows and a non-list `data` are skipped.
2. When `multiChart` is true, a series is split into one entry per distinct `pivot` value in `data[]`; otherwise a single entry uses the static `value`. `needleValue` is the average of the numeric values of the most recent `advanced.averageLatest` rows (empty and non-numeric readings are skipped, not counted as 0).
3. **Maximum Latency** (Multi Chart only; a single `value` carries no time): if the newest row's `tsp` is older than `advanced.maxLatency` seconds, `needleValue` becomes `undefined` and the number is hidden. `tsp` is parsed with `toDate()`, because a bound timestamp column arrives as epoch milliseconds, which `Date.parse` turns into `NaN` (up to 1.1.36 the check therefore never ran for bound data). Studio sends no new `inputData` while a device is silent, so `scheduleStaleCheck()` keeps one timer that re-runs `transformData()` when the next readout goes stale; it is cleared on disconnect and re-armed by `connectedCallback()`.
4. `updated()` runs `sizingSetup()` when `inputData` changed and `applyData()` after every update. The component renders an offscreen `.sizing-container` to measure natural box dimensions, then computes a grid layout and uniform scale (`modifier`) that maximises occupied area in `.value-container` for the current host size. Font sizes for label / value / unit are set inline based on `modifier`, in the same `style` attributes the render binds the colours to; a render that rewrites a colour drops the sizes, which is why `applyData()` runs after every update and not only after new data. A `ResizeObserver` re-runs `applyData()` on resize; it observes in `connectedCallback()`, because Studio moves a tile by detaching and re-attaching it.

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
