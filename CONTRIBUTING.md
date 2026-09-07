# Contributing to rocas

**English** | [日本語](CONTRIBUTING.ja.md)

Thanks for your interest in contributing! Issues and pull requests are welcome.

## Getting set up

```bash
git clone https://github.com/Plumvery/rocas.git
cd rocas
npm install
npm test
```

Requirements: Node.js 18+. There is no build step — the package is plain CommonJS JavaScript.

> [!NOTE]
> On macOS, `npm install` can fail while compiling the `lz4` native module. See the [README's development section](README.md#development) for the `SDKROOT` fix.

## Running tests

```bash
npm test        # runs node test/test.js
```

The test suite is a single script using `node:assert` — no test framework. It makes no network calls; upload behavior is covered by testing the pure planning/codegen functions. Please add tests for any behavior change and make sure the suite passes before opening a PR.

[CI](.github/workflows/ci.yml) runs the same suite on every pull request, on Linux and Windows against Node 18 (the `engines` floor) and 22. Windows is not decoration: lock keys normalize `\` to `/`, and the Studio plugin folder and the `rocas fetch` output-directory check both read `path.sep`.

CI runs a full `npm ci`, native build included. The `lz4` build is not optional: the published package ships a prebuilt `xxhash.node` that no runner can load (`invalid ELF header` on Linux, `not a valid Win32 application` on Windows), and `rbxm-parser` requires it unconditionally. The GitHub runners have the toolchain; only macOS needs the `SDKROOT` workaround above.

## Project layout

```text
bin/
  rocas.js          CLI entry point (argument parsing only — logic lives in src/)
src/
  index.js          Public library surface (everything require("rocas") exports)
  config.js         .env + rocas.toml loading
  sync.js           Sync orchestration, extension → assetType mapping
  upload.js         Open Cloud Assets API client
  asset-map.js      Lock file reading and asset map building
  codegen.js        Luau / .d.ts rendering
  formats/          Pluggable output formats (luau, roblox-ts)
  studio-plugin.js  Studio plugin + manifest generation (plugin Luau source is embedded here)
  watch.js          File watching
test/
  test.js           Test suite
docs/
  api.md            Library API reference
```

## Making changes

- Match the existing code style: tabs for indentation, CommonJS (`require`/`module.exports`), no runtime dependencies beyond `rbxm-parser`.
- If you change the public API or CLI, update the [README](README.md) and the [API reference](docs/api.md) — including the Japanese versions ([README.ja.md](README.ja.md), [docs/api.ja.md](docs/api.ja.md)) when you can. English-only updates are fine; note it in the PR so the translation can follow.
- Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md).

### Common contribution recipes

**Support a new file extension** — add it to `EXT_TO_ASSET_TYPE` in [src/sync.js](src/sync.js) and `EXT_TO_CONTENT_TYPE` in [src/upload.js](src/upload.js), then update the "Supported formats" table in the README.

**Add a codegen format** — built-in formats live in [src/formats/](src/formats/) and are registered in [src/formats/index.js](src/formats/index.js). A format is `{ name, render(lock, varName, options) }` returning `[{ extension, content }]`. External formats can be registered at runtime with `registerCodegenFormat` — consider whether yours needs to be built-in at all.

**Change Studio plugin behavior** — the plugin's Luau source is the `STUDIO_PLUGIN_TEMPLATE` string in [src/studio-plugin.js](src/studio-plugin.js). Regenerate your local copy with `rocas plugin` to test in Studio.

## Opening a pull request

1. Fork and create a topic branch.
2. Make your change with tests.
3. Run `npm test`.
4. Open a PR describing **what** changed and **why**. Link related issues.

For larger changes, please open an issue first so the approach can be discussed before you invest the time.
