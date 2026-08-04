# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
