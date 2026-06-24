# rocas - Roblox Open Cloud Asset Sync

Sync images, sounds, meshes, animations, and videos to Roblox through the [Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets). rocas works with both pure Luau and roblox-ts projects.

## Features

- **All asset types** - images, sounds, meshes, animations, videos
- **Hash-based change detection** - uploads only changed files by using lock files
- **Config-aware re-sync** - re-uploads when the `rocas.toml` creator or `assetType` changes, even if the file is byte-for-byte identical
- **Recursive directory scanning** - nested folders become nested generated objects
- **Luau native by default** - generates `--!strict` type-annotated `.luau` output
- **roblox-ts compatibility format** - opt in to `.luau` + `.d.ts` pairs in an Asphalt-like shape
- **Zero dependencies** - pure Node.js (>=18), no external packages
- **CLI + library** - use `rocas sync` or `require("rocas")`

## Supported Formats

| Type | Extensions | Roblox assetType |
|------|------------|------------------|
| Image | `.png` `.jpg` `.jpeg` `.bmp` `.tga` | Decal |
| Audio | `.mp3` `.ogg` `.wav` `.flac` | Audio |
| Mesh | `.fbx` `.glb` `.gltf` `.obj` | Model |
| Animation | `.rbxm` `.rbxmx` | Animation |
| Video | `.mp4` `.mov` | Video |

## Install

Install globally:

```bash
npm install -g github:Plumvery/rocas
```

Or add it to a project:

```bash
npm install --save-dev github:Plumvery/rocas
```

## Quick Start

Create `rocas.toml` in your project root:

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

Set your API key in `.env`:

```env
ROCAS_API_KEY="your-open-cloud-api-key"
```

Run:

```bash
rocas sync
rocas watch
rocas watch --debounce 5000
rocas plugin
```

## Roblox Studio Plugin

After running `rocas sync`, generate a local Studio plugin from the generated lock files:

```bash
rocas plugin
```

By default, rocas writes the generated `.luau` file directly into your Roblox Studio local Plugins folder. Use `--output <path>` when you want to write it somewhere else.

In Studio, the `rocas` toolbar opens an asset browser UI where you can search synced assets, preview image assets, inspect asset IDs, and click `Insert` to place references in the current place.

The plugin also watches `Script`, `LocalScript`, and `ModuleScript` source changes inside Studio. This works with tools like Rojo and Argon after they sync file changes into Studio, and the asset browser updates each asset's usage count when matching asset IDs, paths, or file names appear in script source.

`Insert` creates the most useful Studio instance for each asset type:

| Asset type | Insert target |
|------------|---------------|
| Decal/Image | Selected `BasePart` as a `Decal`, or `StarterGui` as an `ImageLabel` when no part is selected |
| Audio | `SoundService` as a `Sound` |
| Model/Mesh | `Workspace` through `InsertService:LoadAsset` |
| Animation | `ReplicatedStorage/rocas Animations` as an `Animation` |
| Video | `StarterGui` as a `VideoFrame` |

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

### `format`

| Value | Output | Description |
|-------|--------|-------------|
| `"luau"` (default) | `.luau` only | `--!strict` output with type annotations |
| `"roblox-ts"` | `.luau` + `.d.ts` | roblox-ts / Asphalt-compatible output |

### `stripExtensions`

When `true`, file extensions are removed from generated keys:

```lua
-- stripExtensions = false (default)
images.ui["button.png"]

-- stripExtensions = true
images.ui.button
```

## Change Detection

rocas keeps a `<name>.lock.json` next to each synced directory. An asset is **skipped** only when both of these match the lock:

1. the file content hash, and
2. a fingerprint of the upload-affecting `rocas.toml` config (the `[creator]` `type`/`id` and the resolved `assetType`).

So if you point `rocas.toml` at a different creator (for example, change `[creator].id` from a group to your user, or to a different account), the next `rocas sync` re-uploads every affected asset under the new creator even though the files are unchanged. Editing `output`, `format`, or `stripExtensions` only regenerates code — it never forces a re-upload.

`rocas watch` also watches `rocas.toml` itself: saving a config change reloads it and triggers a sync.

Lock entries written by older versions of rocas have no config fingerprint. The first sync after upgrading records the current config as the baseline **without** re-uploading (so an upgrade alone never churns asset IDs). If you need to force a full re-upload — for example, you changed the creator while still on a pre-fingerprint lock — delete the relevant `*.lock.json` and run `rocas sync`.

### Environment Variables

- `ROCAS_API_KEY` - Roblox Open Cloud API key

Set it in `.env` or export it in your shell.

## Generated Output

For a directory structure like this:

```text
assets/images/
  ui/
    button.png
    icon.png
  fx/
    spark.png
```

### Luau format (default, `stripExtensions = true`)

Generates `images.luau`:

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

Use in Luau:

```lua
local images = require(path.to.images)

imageLabel.Image = images.ui.button
```

### roblox-ts format (`format = "roblox-ts"`)

Generates `images.luau`:

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

And `images.d.ts`:

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

Use in roblox-ts:

```typescript
import images from "shared/images";

imageLabel.Image = images.ui["button.png"];
```

## Programmatic Usage

```javascript
const { loadConfig, loadEnv, syncAll } = require("rocas");

loadEnv();
const config = loadConfig();
await syncAll(config, process.env.ROCAS_API_KEY);
```

## License

MIT
