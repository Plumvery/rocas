# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2026-09-07

### Fixed

- **rocas runs again on npm 12.** `rbxm-parser` is now required inside `generateStudioPluginRbxm` instead of at the top of `src/studio-plugin.js`, so `sync`, `fetch`, `watch`, `manifest`, and `help` no longer load a native module they never call. Under npm 12 those commands died on `require` with `ERR_DLOPEN_FAILED`, because npm 12 blocks a dependency's install scripts unless the *installing project* approves them and `lz4` was left with the unloadable prebuilt binary it ships. Only `rocas plugin` writing a `.rbxm` still needs `lz4`; `--output <file>.rbxmx` writes the same plugin as XML with no native code.

### Note

- 0.4.1's entry overstated its own fix. `allowScripts` in this package's `package.json` only governs installs *of this repository* — it fixed CI and the publish workflow, and does nothing for anyone installing rocas. The consumer-side problem is what 0.4.2 fixes.

## [0.4.1] - 2026-09-07

### Fixed

- **Approve `lz4`'s install script so the package installs under npm 12.** npm 12 blocks a dependency's install scripts unless the project lists it in `allowScripts`, so `npm ci` left `lz4` with the prebuilt binary it ships in its tarball — which no platform can load (`invalid ELF header` on Linux, `not a valid Win32 application` on Windows). `rbxm-parser` requires `lz4` to read `.rbxm` files, so every rocas command died on load. `allowScripts` lets `node-gyp rebuild` run again. 0.4.0 was tagged but never reached the registry: its publish run failed on exactly this.

## [0.4.0] - 2026-09-07

### Changed

- **Converted formats now need their own opt-in.** `.fbx`, `.glb`, `.gltf`, and `.obj` are unlocked by `allowConvertedFormats = true` on the group, not by `assetType = "Model"`. `assetType` says *which* type to upload as; it was doing double duty as permission to upload a format `rocas fetch` can never restore, which meant setting it for an unrelated reason silently enabled one-way uploads. A group that relied on `assetType = "Model"` to sync meshes now skips them until `allowConvertedFormats = true` is added; nothing is re-uploaded and no asset IDs change.

### Added

- `resolveAssetType(syncConfig, ext)` is exported: the pure decision behind the skip, returning the asset type or why the file was skipped.

## [0.3.1] - 2026-09-07

### Added

- First npm release, published as `@plumvery/rocas`. The unscoped `rocas` was rejected by the registry as too similar to existing packages (`recast`, `socks`); the CLI command is still `rocas`.

### Changed

- The npm package name is `@plumvery/rocas`, not `rocas`. Nothing about the code changed between 0.3.0 and 0.3.1; 0.3.0 was tagged before the rename and never reached the registry.

## [0.3.0] - 2026-09-07

### Added

- `rocas fetch` — downloads the assets listed in the lock files, the reverse of `sync`. Files are written as `<assetId>.<ext>` into `.rocas-cache` (`--out` to change it, `--group` to limit the run), with the extension taken from the bytes Roblox returns rather than the original file name. A `<group>.fetch.json` records what was downloaded, so an entry whose lock `assetId` and `hash` are unchanged is not fetched again. Needs an API key with read access to Assets — the same permission image ID resolution already required.
- `fetchAssetContent(assetId, options)` returns a single asset's body as a `Buffer`, with `options.version` to pin a specific asset version. It shares the asset delivery path that image ID resolution already used (Open Cloud first, legacy `assetdelivery` fallback, redirect following, gzip), and `fetchDecalImageId` is now the same fetch plus `extractImageIdFromAssetBody`.
- `fetchAll` and `CONVERTED_EXT_TO_ASSET_TYPE` are exported for library use.
- In-place asset updates: when only a file's content changed — the creator and `assetType` still match the lock — rocas updates the existing asset through the Open Cloud **Update Asset** endpoint (`PATCH /assets/v1/assets/{assetId}`) instead of creating a new one. The asset ID in generated code stays put and Roblox keeps the old content as a previous version. Open Cloud only supports content updates for the `Model` asset type, so every other type still uploads a new asset with a new ID. Measured against the live API on 2026-09-04 with binary `.rbxm` files: two consecutive updates returned `200` with the asset ID unchanged and `revisionId` going 1 → 2 → 3. Roblox's asset guide still says content updates are limited to `.fbx`; the Assets API reference is the one that matches the API.
- `updateAsset` is exported for library use, and `planSyncAction` takes the `assetType` as a fourth argument and can return `"update"`.

### Changed

- **`.rbxm` and `.rbxmx` now sync as `Model` instead of `Animation`.** They are the only formats that survive a `rocas fetch` round trip, so they are the ones a project should be able to reach for without ceremony — and as `Model` they also get in-place updates, keeping their asset IDs across edits. Animation exports are `.rbxm` too and now need `assetType = "Animation"` on their group. **A group that has been syncing `.rbxm` without an explicit `assetType` will re-upload every one of them as a new `Model` with a new asset ID on the next sync**, because the resolved asset type is part of the config fingerprint; set `assetType = "Animation"` before syncing to keep the old behavior and the old IDs.
- **Mesh formats are no longer auto-detected.** `.fbx`, `.glb`, `.gltf`, and `.obj` upload as a `Model` and Roblox never returns the original file, so `rocas fetch` cannot restore them — keeping a repository free of asset bodies is impossible while they sync implicitly. A group now has to set `assetType = "Model"` to upload them; without it the file is skipped with a line explaining why. Only `.rbxm` / `.rbxmx` round-trip. Existing groups that already set `assetType` are unaffected, and the Studio manifest still describes a `.fbx` as a `Model`.

### Fixed

- `.rbxm` and `.rbxmx` were uploaded as `Content-Type: application/xml`. Roblox documents `model/x-rbxm` for these files under both the `Animation` and `Model` asset types, which is what rocas now sends — a `Model` upload of a binary `.rbxm` with that content type was accepted on 2026-09-04 and moderated to `Approved`.

## [0.2.0] - 2026-08-04

### Added

- Image ID resolution: uploading an image through Open Cloud returns a `Decal` ID, which `ImageLabel.Image` and friends can't use. Synced images now record the image inside the decal as `imageId` in the lock file, and codegen, asset maps, and the Studio manifest prefer it. Entries in existing lock files are backfilled on the next `rocas sync` without re-uploading. Requires an API key with read access to Assets; opt out per group with `resolveImageIds = false`.
- `fetchDecalImageId` / `extractImageIdFromAssetBody` / `resolveEntryAssetId` are exported for library use.
- Project documentation set: library [API reference](docs/api.md), [CONTRIBUTING.md](CONTRIBUTING.md), this changelog, and Japanese translations ([README.ja.md](README.ja.md), [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md), [docs/api.ja.md](docs/api.ja.md)).

### Changed

- The IDs generated for images change on the next `rocas sync`: an image now resolves to its image ID instead of the decal ID wrapping it. Nothing is re-uploaded, and `Decal.Texture` accepts either. Set `resolveImageIds = false` on a group to keep the old decal IDs.

### Fixed

- Generated code and the Studio manifest emitted decal IDs for images, so `ImageLabel.Image` and `ParticleEmitter.Texture` silently rendered nothing.
- README: the lock file lives *inside* each synced directory (e.g. `assets/images/images.lock.json`), not next to it.
- `rocas help` now documents the `-o` shorthand for `--output`.

## [0.1.2] - 2026-07-22

Not yet published to npm; install from GitHub (`npm install -g github:Plumvery/rocas`).

### Added

- `rocas watch` — watches asset directories and `rocas.toml`, syncing on change with a configurable `--debounce` interval.
- Roblox Studio asset browser plugin (`rocas plugin`) — browse, search, preview, and insert synced assets from inside Studio, with script usage counting.
- `rocas manifest` — generates a `ReplicatedStorage` manifest ModuleScript from lock files for the Studio plugin to read.
- `rocas manifest --local` — builds the manifest from local asset files using Studio temporary IDs; works offline without an API key.
- Config-aware re-sync: lock entries record a fingerprint of the `[creator]` and resolved `assetType`, so changing them in `rocas.toml` re-uploads affected assets even when file contents are unchanged. Pre-fingerprint locks are re-baselined without re-uploading.
- Lock-based asset map API (`buildAssetMap`, `loadLockForSync`, `lockPathForSync`).
- Pluggable codegen formats (`registerCodegenFormat`, `listCodegenFormats`, `resolveCodegenFormat`).
- Upload requests now send a correct `Content-Type` per file extension.

### Changed

- Project renamed from `rocs` to `rocas`; the API key environment variable is now `ROCAS_API_KEY`.
- Luau is the default codegen format: strict, type-annotated `.luau` output. `roblox-ts` (`.luau` + `.d.ts`) is opt-in via `format = "roblox-ts"`.

## [0.1.1] - 2026-03-24

### Added

- `format = "luau"` codegen with `--!strict` type annotations, and the `stripExtensions` option.

### Changed

- roblox-ts output generates `.luau` + `.d.ts` pairs (Asphalt-compatible) instead of `.ts`.
- Lock files moved from the project root into each asset directory.
- `ASPHALT_API_KEY` fallback removed; the API key is read from a single environment variable.

## [0.1.0] - 2026-03-16

### Added

- Initial release: CLI and library for syncing images, sounds, meshes, animations, and videos to Roblox via the Open Cloud Assets API, with SHA-256 hash-based change detection, lock files, and typed code generation.
