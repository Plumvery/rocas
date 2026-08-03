# API reference

**English** | [日本語](api.ja.md)

Everything exported by `require("rocas")`. The CLI ([`bin/rocas.js`](../bin/rocas.js)) is a thin wrapper over these functions, so anything the CLI does can also be done programmatically.

```javascript
const rocas = require("rocas");
```

- [Shared shapes](#shared-shapes) — [`Config`](#config), [`Lock`](#lock), [`Manifest`](#manifest)
- [Configuration](#configuration) — [`loadEnv`](#loadenvcwd), [`loadConfig`](#loadconfigcwd)
- [Syncing](#syncing) — [`syncAll`](#syncallconfig-apikey-cwd), [`EXT_TO_ASSET_TYPE`](#ext_to_asset_type)
- [Watching](#watching) — [`watchAll`](#watchallconfig-apikey-options)
- [Uploading](#uploading) — [`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator)
- [Code generation](#code-generation) — [`generateLuau`](#generateluaulock-varname-options), [`generateDts`](#generatedtslock-varname-options)
- [Codegen formats](#codegen-formats) — [`registerCodegenFormat`](#registercodegenformatformat), [`listCodegenFormats`](#listcodegenformats), [`resolveCodegenFormat`](#resolvecodegenformatformatname), [`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format)
- [Lock files and asset maps](#lock-files-and-asset-maps) — [`lockPathForSync`](#lockpathforsyncsyncconfig-cwd), [`loadLockForSync`](#loadlockforsyncsyncconfig-cwd), [`buildAssetMap`](#buildassetmapconfig-cwd), [`normalizeAssetPath`](#normalizeassetpathvalue)
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
    },
  ],
}
```

### `Lock`

The contents of a `<name>.lock.json` file, stored inside the synced directory. Keys are slash-separated paths relative to the sync directory:

```javascript
{
  "ui/button.png": {
    assetId: "12345678",     // numeric string; no "rbxassetid://" prefix
    hash: "…",               // SHA-256 of the file contents
    config: "…",             // 16-hex-char fingerprint of creator + assetType (absent in pre-0.1.2 locks)
  },
}
```

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

### `syncAll(config, apiKey, cwd?)`

`async`. Runs a full sync for every `[[sync]]` group, sequentially:

1. Recursively scans `sync.path` (skipping dotfiles and `*.lock.json`).
2. For each file, decides between **upload** (new file, changed content, or changed creator/assetType config), **skip** (lock hash and config fingerprint both match), and **rebaseline** (content matches a pre-fingerprint lock entry — records the fingerprint without uploading).
3. Writes the updated lock file.
4. Renders codegen output via the group's format when `sync.output` is set, writing only files whose content changed.

A group whose directory does not exist is skipped with a log line. Files with unsupported extensions (and no `assetType` override) are skipped.

### `EXT_TO_ASSET_TYPE`

Object mapping lower-case file extensions to Roblox asset types, e.g. `{ ".png": "Decal", ".mp3": "Audio", ".fbx": "Model", ".rbxm": "Animation", ".mp4": "Video", … }`. Used for auto-detection whenever a group has no `assetType` override.

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

### `buildAssetMap(config, cwd?)`

Aggregates every group's lock into one lookup structure (entries lacking an `assetId` are skipped):

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
