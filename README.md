<div align="center">

<h1>rocas</h1>

**Roblox Open Cloud Asset Sync**

Upload images, sounds, meshes, animations, and videos to Roblox through the
[Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets) —
and get typed Luau or roblox-ts bindings back, automatically.

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2018-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Roblox Open Cloud](https://img.shields.io/badge/Roblox-Open%20Cloud-00A2FF?style=flat-square&logo=roblox&logoColor=white)](https://create.roblox.com/docs/cloud/guides/usage-assets)
[![Output](https://img.shields.io/badge/output-Luau%20%7C%20roblox--ts-1D1D1D?style=flat-square)](#format)

[Quick start](#quick-start) ·
[CLI](#cli) ·
[Configuration](#configuration) ·
[Studio plugin](#roblox-studio-plugin) ·
[Generated output](#generated-output)

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
- **Recursive directory scanning** — nested folders become nested generated objects
- **Luau native by default** — generates `--!strict` type-annotated `.luau` output
- **roblox-ts compatible** — opt in to `.luau` + `.d.ts` pairs in an Asphalt-like shape
- **Studio plugin** — browse, search, preview, and insert synced assets without leaving Studio
- **Local preview mode** — browse local assets in Studio without an Open Cloud API key
- **CLI + library** — use `rocas sync` or `require("rocas")`

## Requirements

| | |
|---|---|
| **Node.js** | 18 or newer |
| **Roblox Open Cloud API key** | Required for `sync` and `watch` only. Create one in the [Creator Dashboard](https://create.roblox.com/dashboard/credentials) with Assets read/write permissions for your user or group. |

> [!NOTE]
> `rocas plugin` and `rocas manifest --local` work entirely offline — no API key needed.

## Install

Globally, as a CLI:

```bash
npm install -g github:Plumvery/rocas
```

Or as a project dev dependency:

```bash
npm install --save-dev github:Plumvery/rocas
```

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
| `rocas plugin` | Generate the static Roblox Studio plugin |
| `rocas manifest` | Generate a `ReplicatedStorage` manifest ModuleScript from lock files |
| `rocas help` | Show help |

### Options

| Flag | Applies to | Default | Description |
|------|-----------|---------|-------------|
| `--debounce <ms>` | `watch` | `10000` | Debounce interval before a sync fires |
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
| Mesh | `.fbx` `.glb` `.gltf` `.obj` | `Model` |
| Animation | `.rbxm` `.rbxmx` | `Animation` |
| Video | `.mp4` `.mov` | `Video` |

Asset types are detected from the file extension, and can be overridden per group with `assetType`.

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

rocas keeps a `<name>.lock.json` next to each synced directory. An asset is **skipped** only when both of these match the lock:

1. the file content hash, and
2. a fingerprint of the upload-affecting `rocas.toml` config (the `[creator]` `type`/`id` and the resolved `assetType`).

> [!IMPORTANT]
> If you point `rocas.toml` at a different creator — say you change `[creator].id` from a group to your user — the next `rocas sync` re-uploads every affected asset under the new creator, even though the files themselves are unchanged.

Editing `output`, `format`, or `stripExtensions` only regenerates code; it never forces a re-upload. `rocas watch` also watches `rocas.toml` itself, so saving a config change reloads it and triggers a sync.

<details>
<summary><b>Upgrading from a pre-fingerprint version</b></summary>

<br>

Lock entries written by older versions of rocas have no config fingerprint. The first sync after upgrading records the current config as the baseline **without** re-uploading, so an upgrade alone never churns asset IDs.

If you need to force a full re-upload — for example, you changed the creator while still on a pre-fingerprint lock — delete the relevant `*.lock.json` and run `rocas sync`.

</details>

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
const { loadConfig, loadEnv, syncAll } = require("rocas");

loadEnv();
const config = loadConfig();
await syncAll(config, process.env.ROCAS_API_KEY);
```

<details>
<summary><b>Registering a custom codegen format</b></summary>

<br>

Codegen formats are pluggable. A format is any object with a `name` and a `render` function that returns the files to write:

```javascript
const { registerCodegenFormat, listCodegenFormats } = require("rocas");

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

Issues and pull requests are welcome. Please run `npm test` before opening a PR.

## License

[MIT](LICENSE) © Plumvery
