<div align="center">

<h1>rocas</h1>

**Roblox Open Cloud Asset Sync**

Upload images, sounds, meshes, animations, and videos to Roblox through the
[Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets) —
and get typed Luau or roblox-ts bindings back, automatically.

[![CI](https://img.shields.io/github/actions/workflow/status/Plumvery/rocas/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/Plumvery/rocas/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2018-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Roblox Open Cloud](https://img.shields.io/badge/Roblox-Open%20Cloud-00A2FF?style=flat-square&logo=roblox&logoColor=white)](https://create.roblox.com/docs/cloud/guides/usage-assets)
[![Output](https://img.shields.io/badge/output-Luau%20%7C%20roblox--ts-1D1D1D?style=flat-square)](#format)

[Quick start](#quick-start) ·
[CLI](#cli) ·
[Configuration](#configuration) ·
[Studio plugin](#roblox-studio-plugin) ·
[Generated output](#generated-output) ·
[API reference](docs/api.md)

**English** | [日本語](README.ja.md)

</div>

---

Drop files into `assets/`, run `rocas sync`, and require them with full type safety:

```lua
local images = require(ReplicatedStorage.Shared.images)

imageLabel.Image = images.ui.button --> "rbxassetid://12345678"
```

No manual asset ID copy-pasting, no stale IDs, no untyped string tables.

## Features

- **All asset types** — images, sounds, meshes, animations, videos
- **Hash-based change detection** — uploads only what actually changed, tracked in lock files
- **Config-aware re-sync** — re-uploads when the `rocas.toml` creator or `assetType` changes, even if the file is byte-for-byte identical
- **Stable IDs for models** — editing a synced `Model` updates the existing asset in place instead of minting a new ID
- **Fetch back** — `rocas fetch` downloads what the lock files point at, so a repository can carry IDs instead of asset bodies
- **Recursive directory scanning** — nested folders become nested generated objects
- **Luau native by default** — generates `--!strict` type-annotated `.luau` output
- **roblox-ts compatible** — opt in to `.luau` + `.d.ts` pairs in an Asphalt-like shape
- **Studio plugin** — browse, search, preview, and insert synced assets without leaving Studio
- **Local preview mode** — browse local assets in Studio without an Open Cloud API key
- **CLI + library** — use `rocas sync` or `require("@plumvery/rocas")`

## Requirements

| | |
|---|---|
| **Node.js** | 18 or newer |
| **Roblox Open Cloud API key** | Required for `sync`, `watch`, and `fetch`. Create one in the [Creator Dashboard](https://create.roblox.com/dashboard/credentials) with Assets read/write permissions for your user or group. The **read** permission is what lets rocas resolve [image IDs](#image-ids) and download assets with [`rocas fetch`](#fetching-assets-back). |

> [!NOTE]
> `rocas plugin` and `rocas manifest --local` work entirely offline — no API key needed.

## Install

Globally, as a CLI:

```bash
npm install -g @plumvery/rocas
```

Or as a project dev dependency:

```bash
npm install --save-dev @plumvery/rocas
```

> [!NOTE]
> The package is scoped, but the command it installs is plain `rocas`. The unscoped package name was rejected by the npm registry as too similar to existing packages.

## Quick start

**1. Create `rocas.toml` in your project root**

```toml
[creator]
type = "user"
id = 123456789

[[sync]]
name = "images"
path = "assets/images"
output = "src/shared/images"

[[sync]]
name = "sounds"
path = "assets/sounds"
output = "src/shared/sounds"
```

**2. Add your API key to `.env`**

```env
ROCAS_API_KEY="your-open-cloud-api-key"
```

> [!TIP]
> Make sure `.env` is listed in your `.gitignore`. Never commit an Open Cloud API key.

**3. Sync**

```bash
rocas sync
```

Assets upload, and `src/shared/images.luau` + `src/shared/sounds.luau` are generated with the resulting asset IDs.

**4. Keep it running while you work**

```bash
rocas watch
```

## CLI

| Command | Description |
|---------|-------------|
| `rocas sync` | Upload changed assets and regenerate bindings |
| `rocas watch` | Watch asset directories and `rocas.toml`, syncing on change |
| `rocas fetch` | Download the assets listed in the lock files |
| `rocas plugin` | Generate the static Roblox Studio plugin |
| `rocas manifest` | Generate a `ReplicatedStorage` manifest ModuleScript from lock files |
| `rocas help` | Show help |

### Options

| Flag | Applies to | Default | Description |
|------|-----------|---------|-------------|
| `--debounce <ms>` | `watch` | `10000` | Debounce interval before a sync fires |
| `--group <name>` | `fetch` | every group | Only fetch this `[[sync]]` group; repeatable |
| `--out`, `-o <dir>` | `fetch` | `.rocas-cache` | Where to write the downloaded assets |
| `--output`, `-o <path>` | `plugin` | Studio local Plugins folder | Where to write the plugin |
| `--output`, `-o <path>` | `manifest` | `src/shared/RocasManifest.luau` | Where to write the manifest module |
| `--local` | `manifest` | — | Build from local files instead of lock files; no upload, no API key |

### Environment variables

| Variable | Description |
|----------|-------------|
| `ROCAS_API_KEY` | Roblox Open Cloud API key. Set it in `.env` or export it in your shell. |

## Supported formats

| Type | Extensions | Roblox `assetType` |
|------|------------|--------------------|
| Image | `.png` `.jpg` `.jpeg` `.bmp` `.tga` | `Decal` |
| Audio | `.mp3` `.ogg` `.wav` `.flac` | `Audio` |
| Model | `.rbxm` `.rbxmx` | `Model` |
| Mesh | `.fbx` `.glb` `.gltf` `.obj` | `Model` — needs `allowConvertedFormats` |
| Video | `.mp4` `.mov` | `Video` |

Asset types are detected from the file extension, and can be overridden per group with `assetType`.

> [!IMPORTANT]
> Mesh formats are **not** auto-detected. Roblox converts `.fbx`, `.glb`, `.gltf`, and `.obj` into a `Model` on upload and never hands the original file back, so [`rocas fetch`](#fetching-assets-back) can't restore them. rocas skips them with an explanation unless the group opts in:
>
> ```toml
> [[sync]]
> name = "meshes"
> path = "assets/meshes"
> allowConvertedFormats = true   # without this, .fbx files are skipped
> ```
>
> `assetType` does **not** unlock them; it only says which type to upload as. The opt-in is its own switch on purpose, so that setting `assetType` for an unrelated reason can't quietly turn on one-way uploads.

Animations are `.rbxm` files too, and `.rbxm` syncs as a `Model`, so a group of animation exports has to say so:

```toml
[[sync]]
name = "animations"
path = "assets/animations"
assetType = "Animation"
```

> [!WARNING]
> `.rbxm` and `.rbxmx` used to default to `Animation`. A group that has been syncing them **without** an explicit `assetType` sees the asset type change as a config change on the next `rocas sync`, which re-uploads every one of them as a new `Model` with a **new asset ID**. Set `assetType = "Animation"` on the group before syncing to keep the old behavior and the old IDs.

### Image IDs

Open Cloud uploads images as `Decal` assets, and the ID it returns is the **decal**, not the image inside it. A decal ID works for `Decal.Texture`, but `ImageLabel.Image`, `ImageButton.Image`, `ParticleEmitter.Texture`, and friends want the **image** ID.

So after uploading an image, rocas downloads the decal and reads the image ID out of it, storing it as `imageId` in the lock file. Generated code, asset maps, and the Studio manifest all prefer `imageId` and fall back to the decal ID when it isn't there.

```json
{
  "ui/button.png": { "assetId": "12345679", "imageId": "12345678", "hash": "…", "config": "…" }
}
```

This needs an API key with **read** access to Assets — Roblox has required authentication on asset delivery since April 2025. Images already in an older lock file are backfilled on the next `rocas sync` without re-uploading.

> [!NOTE]
> Resolution never fails a sync. If the image ID can't be read (moderation still pending, key missing the read permission), rocas warns, keeps the decal ID, and retries on the next sync. After three failures in a row it stops trying for the rest of that group. Set `resolveImageIds = false` on a group to turn it off entirely.

## Configuration

### `rocas.toml`

```toml
[creator]
type = "user"       # "user" or "group"
id = 123456789      # Roblox User ID or Group ID

[[sync]]
name = "images"              # Group name, used for images.lock.json
path = "assets/images"       # Directory to scan recursively
output = "src/shared/images" # Generates images.luau by default
# assetType = "Decal"        # Optional: force asset type
# format = "luau"            # "luau" (default) or "roblox-ts"
# stripExtensions = false    # Remove file extensions from generated keys
# resolveImageIds = true     # Resolve decal IDs to image IDs (default true)
# allowConvertedFormats = true # Allow .fbx/.glb/.gltf/.obj, which cannot be fetched back
```

See [`rocas.toml.example`](rocas.toml.example) for a fully commented reference.

### `format`

| Value | Output | Description |
|-------|--------|-------------|
| `"luau"` *(default)* | `.luau` | `--!strict` output with type annotations |
| `"roblox-ts"` | `.luau` + `.d.ts` | roblox-ts / Asphalt-compatible output |

### `stripExtensions`

When `true`, file extensions are removed from generated keys:

```lua
-- stripExtensions = false (default)
images.ui["button.png"]

-- stripExtensions = true
images.ui.button
```

## Change detection

rocas keeps a `<name>.lock.json` inside each synced directory (for example `assets/images/images.lock.json`). An asset is **skipped** only when both of these match the lock:

1. the file content hash, and
2. a fingerprint of the upload-affecting `rocas.toml` config (the `[creator]` `type`/`id` and the resolved `assetType`).

> [!IMPORTANT]
> If you point `rocas.toml` at a different creator — say you change `[creator].id` from a group to your user — the next `rocas sync` re-uploads every affected asset under the new creator, even though the files themselves are unchanged.

### Updating in place

When only the file content changed — the creator and `assetType` still match the lock — rocas updates the existing asset instead of creating a new one, so the ID in your generated code stays put and Roblox keeps the old content as a previous version.

This only applies to the `Model` asset type. Open Cloud does not support content updates for `Audio`, `Decal`, `Mesh`, `Video`, or `Animation`, so editing one of those still uploads a new asset with a new ID.

> [!NOTE]
> `.rbxm` and `.rbxmx` default to the `Model` asset type, so editing one updates the existing asset in place. Binary `.rbxm` models do update in place — measured against the live API on 2026-09-04 — even though Roblox's [asset guide](https://create.roblox.com/docs/cloud/guides/usage-assets) still says content updates are limited to `.fbx`. A group carrying animation exports needs `assetType = "Animation"`, and those still upload a new asset on every edit.

Editing `output`, `format`, or `stripExtensions` only regenerates code; it never forces a re-upload. `rocas watch` also watches `rocas.toml` itself, so saving a config change reloads it and triggers a sync.

<details>
<summary><b>Upgrading from a pre-fingerprint version</b></summary>

<br>

Lock entries written by older versions of rocas have no config fingerprint. The first sync after upgrading records the current config as the baseline **without** re-uploading, so an upgrade alone never churns asset IDs.

If you need to force a full re-upload — for example, you changed the creator while still on a pre-fingerprint lock — delete the relevant `*.lock.json` and run `rocas sync`.

</details>

## Fetching assets back

`rocas fetch` is `sync` in reverse: it reads the lock files and downloads what they point at.

```bash
rocas fetch                     # every group
rocas fetch --group models      # one group
rocas fetch --out .rocas-cache  # somewhere else
```

Files land as `<assetId>.<ext>`, alongside a `<group>.fetch.json` recording what was downloaded. The extension comes from the bytes Roblox returns rather than the original file name, because they don't always agree — an image comes back as the image, a `.fbx` comes back as the `.rbxm` Roblox built from it. An asset whose lock `assetId` and `hash` are unchanged, and whose file is still on disk, is not downloaded again.

That is what makes it possible to keep asset bodies out of the repository: commit the lock files, gitignore the sources, and run `rocas fetch` after a clone. Two things bound how far that goes.

> [!WARNING]
> **Don't fetch into a synced path.** A downloaded file is not byte-for-byte identical to the original, so the next `rocas sync` reads it as changed. For a `Model` that costs a pointless upload; for `Decal`, `Audio`, and `Video` it mints a **new asset ID** and breaks every reference to the old one. The default output directory sits outside every synced path for exactly this reason, and rocas warns when `--out` points inside one.

> [!NOTE]
> **Mesh sources never come back.** Uploading `.fbx` (or `.glb`, `.gltf`, `.obj`) produces a `Model`; the original file is gone. Only `.rbxm` / `.rbxmx` round-trip, so a project that wants the bytes out of the repository should export models as `.rbxm` — which syncs as a `Model` with no extra configuration.

For a single asset, [`fetchAssetContent`](docs/api.md#fetchassetcontentassetid-options) returns the bytes directly:

```javascript
const { fetchAssetContent } = require("@plumvery/rocas");

const rbxm = await fetchAssetContent(assetId, { apiKey });
const older = await fetchAssetContent(assetId, { apiKey, version: 3 });
```

## Roblox Studio plugin

Generate the plugin once:

```bash
rocas plugin
```

The plugin is static — you never need to regenerate it when assets change.

> [!NOTE]
> By default rocas writes the generated `.rbxm` directly into your Roblox Studio local Plugins folder, because Studio does not recognize `.luau` files there as local plugins. Use `--output <path>` to write it elsewhere; `.lua` and `.rbxmx` output paths are also supported.

### Browsing synced assets

After running `rocas sync`, generate a manifest ModuleScript for Rojo or Argon to sync into `ReplicatedStorage`:

```bash
rocas manifest --output src/shared/RocasManifest.luau
```

The plugin scans `ReplicatedStorage` for the manifest module, then opens an asset browser where you can search synced assets, preview images, inspect asset IDs, and click **Insert** to place references into the current place. When Rojo or Argon syncs a changed manifest into Studio, the plugin reloads the catalog automatically.

It also watches `Script`, `LocalScript`, and `ModuleScript` source changes inside Studio, updating each asset's usage count as matching asset IDs, paths, or file names appear in script source.

### Browsing without uploading

```bash
rocas manifest --local --output src/shared/RocasManifest.luau
```

Local manifests scan the asset folders in `rocas.toml` directly and do not require `ROCAS_API_KEY`. In Studio, click **Import** to choose matching files, or **Load** on a single row.

> [!WARNING]
> Local mode uses `File:GetTemporaryId()` and `rbxtemp://` IDs. These references only work in the current Studio session — they are not shared, and not saved as permanent Roblox assets. Use `rocas sync` + `rocas manifest` when you need durable `rbxassetid://` IDs for team, shared, or runtime use.

<details>
<summary><b>What <code>Insert</code> creates for each asset type</b></summary>

<br>

| Asset type | Insert target |
|------------|---------------|
| Decal / Image | Selected `BasePart` as a `Decal`, or `StarterGui` as an `ImageLabel` when no part is selected |
| Audio | `SoundService` as a `Sound` |
| Model / Mesh | `Workspace` through `InsertService:LoadAsset` |
| Animation | `ReplicatedStorage/rocas Animations` as an `Animation` |
| Video | `StarterGui` as a `VideoFrame` |

</details>

## Generated output

Given this directory structure:

```text
assets/images/
  ui/
    button.png
    icon.png
  fx/
    spark.png
```

<details open>
<summary><b>Luau format</b> — default, shown with <code>stripExtensions = true</code></summary>

<br>

`images.luau`:

```lua
--!strict
-- This file is auto-generated by rocas. Do not edit manually.

type ImagesType = {
	fx: {
		spark: string,
	},
	ui: {
		button: string,
		icon: string,
	},
}

local images: ImagesType = {
	fx = {
		spark = "rbxassetid://12345678",
	},
	ui = {
		button = "rbxassetid://23456789",
		icon = "rbxassetid://34567890",
	},
}

return images
```

Usage:

```lua
local images = require(path.to.images)

imageLabel.Image = images.ui.button
```

</details>

<details>
<summary><b>roblox-ts format</b> — <code>format = "roblox-ts"</code></summary>

<br>

`images.luau`:

```lua
-- This file is auto-generated by rocas. Do not edit manually.
local images = {
	fx = {
		["spark.png"] = "rbxassetid://12345678",
	},
	ui = {
		["button.png"] = "rbxassetid://23456789",
		["icon.png"] = "rbxassetid://34567890",
	},
}

return images
```

`images.d.ts`:

```typescript
// This file is auto-generated by rocas. Do not edit manually.
declare const images: {
	fx: {
		"spark.png": string
	}
	ui: {
		"button.png": string
		"icon.png": string
	}
}

export = images
```

Usage:

```typescript
import images from "shared/images";

imageLabel.Image = images.ui["button.png"];
```

</details>

## Programmatic usage

```javascript
const { loadConfig, loadEnv, syncAll } = require("@plumvery/rocas");

loadEnv();
const config = loadConfig();
await syncAll(config, process.env.ROCAS_API_KEY);
```

Every export — sync, codegen, lock-file, and Studio plugin helpers — is documented in the [API reference](docs/api.md).

<details>
<summary><b>Registering a custom codegen format</b></summary>

<br>

Codegen formats are pluggable. A format is any object with a `name` and a `render` function that returns the files to write:

```javascript
const { registerCodegenFormat, listCodegenFormats } = require("@plumvery/rocas");

registerCodegenFormat({
	name: "json",
	render(lock, varName, { stripExtensions = false } = {}) {
		return [{ extension: ".json", content: JSON.stringify(lock, null, 2) }];
	},
});

listCodegenFormats(); //=> ["luau", "roblox-ts", "json"]
```

Each returned entry is `{ extension, content }`, and is written next to the group's `output` path. Once registered, the format can be selected per sync group with `format = "json"` in `rocas.toml`.

</details>

## Development

```bash
git clone https://github.com/Plumvery/rocas.git
cd rocas
npm install
npm test
```

<details>
<summary><b>macOS: <code>npm install</code> fails with <code>'string.h' file not found</code></b></summary>

<br>

The `rbxm-parser` dependency pulls in `lz4`, a native module built with `node-gyp`. On macOS with Xcode selected as the active developer directory, `node-gyp` may fail to resolve the SDK headers:

```text
../lib/binding/lz4_binding.cc:1:10: fatal error: 'string.h' file not found
```

Point it at the SDK explicitly:

```bash
export SDKROOT="$(xcrun --show-sdk-path)"
npm install
```

Add that `export` to your shell profile to make it stick.

</details>

<details>
<summary><b>Project layout</b></summary>

<br>

```text
bin/
  rocas.js          CLI entry point
src/
  index.js          Public library surface
  config.js         .env + rocas.toml loading
  sync.js           Sync orchestration, extension → assetType mapping
  upload.js         Open Cloud Assets API client
  asset-map.js      Lock file reading and asset map building
  codegen.js        Code generation
  formats/          Pluggable output formats (luau, roblox-ts)
  studio-plugin.js  Studio plugin and manifest generation
  watch.js          File watching
test/
  test.js           Test suite (node test/test.js)
```

</details>

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow. Release history lives in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Plumvery
