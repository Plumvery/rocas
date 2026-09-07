# API reference

**English** | [日本語](api.ja.md)

Everything exported by `require("rocas")`. The CLI ([`bin/rocas.js`](../bin/rocas.js)) is a thin wrapper over these functions, so anything the CLI does can also be done programmatically.

```javascript
const rocas = require("rocas");
```

- [Shared shapes](#shared-shapes) — [`Config`](#config), [`Lock`](#lock), [`Manifest`](#manifest)
- [Configuration](#configuration) — [`loadEnv`](#loadenvcwd), [`loadConfig`](#loadconfigcwd)
- [Syncing](#syncing) — [`syncAll`](#syncallconfig-apikey-cwd-options), [`syncOne`](#synconesyncconfig-creator-apikey-cwd-options), [`needsImageId`](#needsimageidentry-assettype), [`EXT_TO_ASSET_TYPE`](#ext_to_asset_type), [`CONVERTED_EXT_TO_ASSET_TYPE`](#converted_ext_to_asset_type)
- [Watching](#watching) — [`watchAll`](#watchallconfig-apikey-options)
- [Uploading](#uploading) — [`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator), [`updateAsset`](#updateassetassetid-filepath-assettype-apikey-creator)
- [Fetching](#fetching) — [`fetchAll`](#fetchallconfig-apikey-cwd-options), [`fetchAssetContent`](#fetchassetcontentassetid-options)
- [Image IDs](#image-ids) — [`fetchDecalImageId`](#fetchdecalimageiddecalid-options), [`extractImageIdFromAssetBody`](#extractimageidfromassetbodybody)
- [Code generation](#code-generation) — [`generateLuau`](#generateluaulock-varname-options), [`generateDts`](#generatedtslock-varname-options)
- [Codegen formats](#codegen-formats) — [`registerCodegenFormat`](#registercodegenformatformat), [`listCodegenFormats`](#listcodegenformats), [`resolveCodegenFormat`](#resolvecodegenformatformatname), [`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format)
- [Lock files and asset maps](#lock-files-and-asset-maps) — [`lockPathForSync`](#lockpathforsyncsyncconfig-cwd), [`loadLockForSync`](#loadlockforsyncsyncconfig-cwd), [`resolveEntryAssetId`](#resolveentryassetidentry), [`buildAssetMap`](#buildassetmapconfig-cwd), [`normalizeAssetPath`](#normalizeassetpathvalue)
- [Studio plugin and manifest](#studio-plugin-and-manifest) — [`writeStudioPlugin`](#writestudiopluginconfig-cwd-outputpath-options), [`writeStudioManifest`](#writestudiomanifestconfig-cwd-outputpath-options), and lower-level helpers

## Shared shapes

### `Config`

The parsed form of `rocas.toml`, as returned by [`loadConfig`](#loadconfigcwd):

```javascript
{
  creator: {
    type: "user" | "group",   // defaults to "user"
    id: 123456789,            // required
  },
  sync: [
    {
      name: "images",              // required — lock file name and generated variable name
      path: "assets/images",       // required — directory scanned recursively
      output: "src/shared/images", // optional — codegen output path (extension added by the format)
      assetType: "Decal",          // optional — force the Roblox assetType for every file
      format: "luau",              // optional — codegen format name (default "luau")
      stripExtensions: false,      // optional — drop file extensions from generated keys
      resolveImageIds: true,       // optional — resolve decal IDs to image IDs (default true)
    },
  ],
}
```

### `Lock`

The contents of a `<name>.lock.json` file, stored inside the synced directory. Keys are slash-separated paths relative to the sync directory:

```javascript
{
  "ui/button.png": {
    assetId: "12345679",     // numeric string; no "rbxassetid://" prefix
    imageId: "12345678",     // images only — the image inside the decal; absent when unresolved
    hash: "…",               // SHA-256 of the file contents
    config: "…",             // 16-hex-char fingerprint of creator + assetType (absent in pre-0.1.2 locks)
  },
}
```

`assetId` for an image is the **decal** Open Cloud returned; `imageId` is the image inside it. Everything that reads a lock resolves an entry with [`resolveEntryAssetId`](#resolveentryassetidentry), which prefers `imageId`.

### `Manifest`

Built by [`buildStudioPluginManifest`](#buildstudiopluginmanifestconfig-cwd-options) and embedded into the manifest ModuleScript for the Studio plugin:

```javascript
{
  generatedBy: "rocas",
  mode: "uploaded" | "local",
  assets: [
    {
      group: "images",              // [[sync]] name
      path: "ui/button.png",        // path relative to the sync directory
      name: "button.png",
      sourcePath: "assets/images/ui/button.png", // relative to cwd
      assetType: "Decal",
      source: "uploaded" | "local",
      assetId: "rbxassetid://12345678", // uploaded mode only
      size: 4096,                       // local mode only (bytes)
    },
  ],
}
```

## Configuration

### `loadEnv(cwd?)`

Reads `.env` in `cwd` (default `process.cwd()`) and assigns each `KEY=value` line into `process.env`. Silently does nothing when no `.env` exists. Values may be double-quoted; `#` comment lines are ignored.

### `loadConfig(cwd?)`

Reads and parses `rocas.toml` in `cwd`, returning a [`Config`](#config).

Throws when `rocas.toml` is missing or `[creator] id` is absent. `creator.type` defaults to `"user"`.

The parser is intentionally small: it supports `[creator]`, repeated `[[sync]]` tables, and `key = value` pairs with string / integer / boolean values — not the full TOML spec.

## Syncing

### `syncAll(config, apiKey, cwd?, options?)`

`async`. Runs a full sync for every `[[sync]]` group, sequentially:

1. Recursively scans `sync.path` (skipping dotfiles and `*.lock.json`).
2. For each file, decides between **upload** (new file, changed creator/assetType config, or changed content that cannot be updated in place), **update** (changed content on an asset type Open Cloud can update — same asset ID, new version), **skip** (lock hash and config fingerprint both match), and **rebaseline** (content matches a pre-fingerprint lock entry — records the fingerprint without uploading).
3. Resolves the [image ID](#fetchdecalimageiddecalid-options) of every `Decal` entry that lacks one — including skipped and rebaselined entries, so old locks are backfilled without re-uploading. Disabled per group with `resolveImageIds = false`.
4. Writes the updated lock file.
5. Renders codegen output via the group's format when `sync.output` is set, writing only files whose content changed.

A group whose directory does not exist is skipped with a log line. Files with unsupported extensions (and no `assetType` override) are skipped, as are the [converted formats](#converted_ext_to_asset_type) — `.fbx` and friends — which need the group to name their `assetType` explicitly.

Image ID resolution never fails a sync: a failure logs a warning and leaves the decal ID in place for the next run. After three consecutive failures it is skipped for the rest of the group.

- `options.resolveImageId` — `(decalId, apiKey) => Promise<string>`, replacing [`fetchDecalImageId`](#fetchdecalimageiddecalid-options). Mostly useful for tests and offline runs.

### `syncOne(syncConfig, creator, apiKey, cwd?, options?)`

`async`. The single-group form of `syncAll`, taking one `[[sync]]` entry and the `creator` directly.

### `needsImageId(entry, assetType)`

`true` when a [`Lock`](#lock) entry is an uploaded `Decal` that has no `imageId` yet.

### `EXT_TO_ASSET_TYPE`

Object mapping lower-case file extensions to Roblox asset types, e.g. `{ ".png": "Decal", ".mp3": "Audio", ".rbxm": "Animation", ".mp4": "Video", … }`. Used for auto-detection whenever a group has no `assetType` override.

### `CONVERTED_EXT_TO_ASSET_TYPE`

`{ ".fbx": "Model", ".glb": "Model", ".gltf": "Model", ".obj": "Model" }` — the formats Roblox converts on upload. Uploading one produces a `Model` and the original file is not recoverable, so [`fetchAll`](#fetchallconfig-apikey-cwd-options) cannot restore it. These are deliberately **not** in `EXT_TO_ASSET_TYPE`: a group has to set `assetType = "Model"` to sync them. The table is still used to describe a file (the Studio manifest calls a `.fbx` a `Model`).

## Watching

### `watchAll(config, apiKey, options?)`

Starts watching and never returns (runs until the process exits; Ctrl-C is handled).

- Watches each existing `sync.path` recursively; changes schedule a debounced [`syncAll`](#syncallconfig-apikey-cwd).
- Watches `rocas.toml` (via its parent directory, so atomic editor saves are caught) and reloads the config before the next sync — a creator change therefore triggers config-fingerprint re-uploads.
- `options.debounce` — milliseconds to wait after the last change before syncing. Default `10000`.

Exits the process with code 1 when none of the configured directories exist.

## Uploading

### `uploadAsset(filePath, assetType, apiKey, creator)`

`async`. Uploads one file through the [Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets) (`POST apis.roblox.com/assets/v1/assets`), then polls the returned operation every 2 s until it completes.

- `assetType` — `"Decal"`, `"Audio"`, `"Model"`, `"Animation"`, or `"Video"`.
- `creator` — `{ type: "user" | "group", id }`.
- Returns the asset ID as a **numeric string** (no `rbxassetid://` prefix).
- Throws on non-200 responses and failed operations. The `Content-Type` of the file part is derived from the extension.
- For images this is the **decal** ID — see [`fetchDecalImageId`](#fetchdecalimageiddecalid-options).

### `updateAsset(assetId, filePath, assetType, apiKey, creator)`

`async`. Replaces the content of an existing asset (`PATCH apis.roblox.com/assets/v1/assets/{assetId}`), then polls the returned operation the same way [`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator) does. The asset ID does not change; Roblox records a new version of it.

- Only `Model` assets can have their content updated — binary `.rbxm` included. `Audio`, `Decal`, `Mesh`, and `Video` are documented as not updatable, and `Animation` is not documented as updatable either — Roblox answers `400` for those. [`syncAll`](#syncallconfig-apikey-cwd-options) uploads a new asset instead of calling this for them.
- Measured against the live API on 2026-09-04: a group-owned `Model` created from a binary `.rbxm` (`revisionId` 1) was updated twice through this endpoint, each call returning `200` with the same asset ID and `revisionId` 2, then 3.
- No `updateMask` is sent, so only the file content changes — `displayName` and `description` are left alone.
- The same endpoint also does metadata-only updates: `?updateMask=displayName,description` with **no `fileContent` part** returns `200` and leaves the content revision where it was, even though the reference marks both multipart parts as required (measured 2026-09-04). rocas does not use that form.
- Returns `assetId` as a **numeric string**, for symmetry with `uploadAsset`.
- Throws on non-200 responses and failed operations.

> [!NOTE]
> Roblox's own [asset guide](https://create.roblox.com/docs/cloud/guides/usage-assets) says content updates are limited to `.fbx`. That line is wrong — or at least stale as of 2026-09-04. The [Assets API reference](https://create.roblox.com/docs/cloud/reference/AssetsApi) is the one that matches the API's actual behavior: the content body can be updated for Models generally.

## Fetching

### `fetchAll(config, apiKey, cwd?, options?)`

`async`. The reverse of [`syncAll`](#syncallconfig-apikey-cwd-options): reads every group's lock file and downloads the assets it lists.

Each entry is resolved with [`resolveEntryAssetId`](#resolveentryassetidentry), so an image is fetched by its `imageId` rather than the decal wrapping it. Files are written as `<assetId>.<ext>`, where the extension comes from the bytes Roblox returns rather than the lock key — a `.fbx` upload comes back as the `.rbxm` Roblox built from it. A `<group>.fetch.json` next to them records `{ assetId, hash, file }` per lock key; an entry whose `assetId` and `hash` still match, and whose file is still on disk, is not downloaded again.

- `options.out` — output directory, resolved against `cwd`. Default `.rocas-cache`.
- `options.groups` — array of `[[sync]]` names to limit the run to. Throws on an unknown name.
- `options.fetchContent` — `(assetId, apiKey) => Promise<Buffer>`, replacing [`fetchAssetContent`](#fetchassetcontentassetid-options). Mostly useful for tests and offline runs.
- Returns `{ outDir, fetched, reused, failed }`.

A single failure does not stop the run: it logs a warning and counts toward `failed`. After three consecutive failures the rest of that group is skipped.

> [!WARNING]
> Keep the output directory **outside** every `sync.path`. A downloaded file is not byte-for-byte identical to the original, so the next sync sees it as changed — an in-place update for a `Model`, but a new upload and a **new asset ID** for `Decal`, `Audio`, and `Video`. `fetchAll` warns when `options.out` lands inside a synced path, and the default never does.

### `fetchAssetContent(assetId, options?)`

`async`. Downloads one asset and returns its body as a `Buffer`. Accepts a bare ID or an `rbxassetid://…` string.

What comes back is what Roblox stores, not what was uploaded: a `Model` is a MeshPart-ified `.rbxm`, an image is the image bytes (so pass the image ID, not the decal ID). Uses the same two-hop asset delivery as [`fetchDecalImageId`](#fetchdecalimageiddecalid-options), including the Open Cloud → legacy fallback and the gzip handling.

- `options.apiKey` — Open Cloud API key; needs **read** access to Assets.
- `options.version` — pins a specific asset version (`.../assetId/{id}/version/{n}`).
- `options.attempts` (default `3`) / `options.retryDelayMs` (default `2000`) — a freshly uploaded asset may not be servable yet.
- `options.fetchAsset` — `(url, headers) => Promise<Buffer|string>`, replacing the built-in fetcher.
- Throws when every endpoint fails.

```javascript
const { fetchAssetContent } = require("rocas");

const rbxm = await fetchAssetContent("123456789", { apiKey });
const older = await fetchAssetContent("123456789", { apiKey, version: 3 });
```

## Image IDs

### `fetchDecalImageId(decalId, options?)`

`async`. Downloads a `Decal` asset and returns the **numeric string** ID of the image inside it — the value `ImageLabel.Image` and friends need. Accepts a bare ID or an `rbxassetid://…` string.

Asset delivery is a two-hop fetch (JSON location, then the gzipped asset body from the CDN), tried in this order:

1. `apis.roblox.com/asset-delivery-api/v1/assetId/{id}` with the `x-api-key` header — only when `options.apiKey` is set.
2. `assetdelivery.roblox.com/v1/assetId/{id}` unauthenticated — a fallback for old public assets. Roblox rejects unauthenticated asset delivery for most assets since April 2025, so this rarely succeeds on its own.

- `options.apiKey` — Open Cloud API key; needs **read** access to Assets.
- `options.attempts` (default `3`) / `options.retryDelayMs` (default `2000`) — a freshly uploaded asset may not be servable yet.
- `options.fetchAsset` — `(url, headers) => Promise<Buffer|string>`, replacing the built-in fetcher.
- Throws when every endpoint fails or no image ID is found in the asset body.

### `extractImageIdFromAssetBody(body)`

Pulls the image ID out of a downloaded decal, preferring the `Texture` property and falling back to the first asset URL in the body. Handles both XML and binary model bodies. Returns `null` when there is none.

## Code generation

Low-level renderers used by the built-in formats. Most callers want a [format](#codegen-formats) instead.

### `generateLuau(lock, varName, options?)`

Returns Luau source for a [`Lock`](#lock) as a nested table of `"rbxassetid://…"` strings.

- `options.strict` (default `false`) — emit `--!strict`, a generated `<VarName>Type` type, and a type annotation.
- `options.stripExtensions` (default `false`) — drop file extensions from keys.

### `generateDts(lock, varName, options?)`

Returns a TypeScript `.d.ts` declaration (`declare const <varName>: {…}; export = <varName>`) matching the same tree. Accepts `options.stripExtensions`.

## Codegen formats

A format turns a lock into one or more output files. Formats are selected per group with `format = "<name>"` in `rocas.toml`.

### `registerCodegenFormat(format)`

Registers (or replaces) a format and returns it. A format is:

```javascript
{
  name: "json",
  render(lock, varName, options) {
    // options: { stripExtensions }
    return [{ extension: ".json", content: JSON.stringify(lock, null, 2) }];
  },
}
```

Each returned entry is written to the group's `output` base path plus `extension`. Throws when `name` or `render` is missing.

### `listCodegenFormats()`

Returns the registered format names, e.g. `["luau", "roblox-ts"]`.

### `resolveCodegenFormat(formatName?)`

Returns the format registered under `formatName`, defaulting to [`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format). Throws with the list of known formats when the name is unknown.

### `DEFAULT_CODEGEN_FORMAT`

`"luau"`.

Built-in formats:

| Name | Output | Notes |
|------|--------|-------|
| `luau` | `.luau` | `generateLuau` with `strict: true` |
| `roblox-ts` | `.luau` + `.d.ts` | non-strict Luau table plus a matching declaration file |

## Lock files and asset maps

### `lockPathForSync(syncConfig, cwd?)`

Absolute path of the group's lock file: `<cwd>/<sync.path>/<sync.name>.lock.json`.

### `loadLockForSync(syncConfig, cwd?)`

Parses the group's lock file, returning a [`Lock`](#lock) — or `{}` when the file does not exist.

### `resolveEntryAssetId(entry)`

The ID a [`Lock`](#lock) entry should actually be referenced by: `imageId` when present, otherwise `assetId`, otherwise `null`. Used by codegen, [`buildAssetMap`](#buildassetmapconfig-cwd), and the Studio manifest.

### `buildAssetMap(config, cwd?)`

Aggregates every group's lock into one lookup structure (entries with no usable ID are skipped):

```javascript
{
  bySourcePath: { "C:/…/assets/images/ui/button.png": "rbxassetid://12345678" },
  byRelativePath: {
    "assets/images/ui/button.png": "rbxassetid://12345678", // relative to cwd
    "ui/button.png": "rbxassetid://12345678",               // lock key (first group wins on collision)
    "images/ui/button.png": "rbxassetid://12345678",        // "<group>/<lock key>"
  },
  groups: { images: { "ui/button.png": "rbxassetid://12345678" } },
}
```

All paths use forward slashes; values always carry the `rbxassetid://` prefix.

### `normalizeAssetPath(value)`

Replaces backslashes with forward slashes.

## Studio plugin and manifest

The Studio integration is two artifacts: a **static plugin** installed once into Studio, and a **manifest ModuleScript** regenerated from lock files and synced into `ReplicatedStorage` (via Rojo/Argon), which the plugin reads. See the [README](../README.md#roblox-studio-plugin) for the workflow.

### `writeStudioPlugin(config, cwd?, outputPath?, options?)`

Generates the plugin and writes it (only when the content changed), creating directories as needed. Returns the absolute output path.

- `config` is unused — the plugin is static; pass `null`.
- Default output: [`defaultStudioPluginOutputPath`](#defaultstudiopluginoutputpathcwd-env-platform) (the Studio local Plugins folder).
- The output **extension picks the encoding**: `.lua`/`.luau` → raw plugin source, `.rbxmx` → XML model, anything else → binary `.rbxm`.

### `writeStudioManifest(config, cwd?, outputPath?, options?)`

Builds the manifest for `config` and writes the manifest ModuleScript (only when the content changed). Returns the absolute output path.

- Default output: `src/shared/RocasManifest.luau`.
- `options.local` — build a [local-mode](../README.md#browsing-without-uploading) manifest from the files on disk instead of lock files.

### `buildStudioPluginManifest(config, cwd?, options?)`

Returns the [`Manifest`](#manifest) object without writing anything.

- Uploaded mode (default): reads each group's lock file; groups without a lock are skipped.
- Local mode (`options.local`): recursively scans each group's directory; files with unsupported extensions are skipped; entries carry `size` instead of `assetId`.
- Assets are sorted by group, then path.

### `generateManifestModule(manifest)`

Returns the manifest ModuleScript source: a Luau module that `HttpService:JSONDecode`s the embedded manifest JSON.

### `generateStudioPlugin()`

Returns the raw Luau source of the static Studio plugin.

### `generateStudioPluginRbxm(source?)` / `generateStudioPluginRbxmx(source?)`

Wrap plugin source (default: `generateStudioPlugin()`) in a binary `.rbxm` buffer / an XML `.rbxmx` string containing a single `Script` named `rocas`.

### `robloxStudioPluginsDir(env?, platform?)`

Roblox Studio's local Plugins folder: `%LOCALAPPDATA%\Roblox\Plugins` on Windows, `~/Documents/Roblox/Plugins` otherwise, or `null` when neither environment variable is set.

### `defaultStudioPluginOutputPath(cwd?, env?, platform?)`

`<plugins dir>/rocas-studio-plugin.rbxm`, falling back to `cwd` when the Plugins folder can't be determined.

### `resolveStudioPluginOutputPath(cwd?, outputPath?)` / `resolveManifestOutputPath(cwd?, outputPath?)`

Resolve an explicit output path against `cwd`, or return the respective default.
