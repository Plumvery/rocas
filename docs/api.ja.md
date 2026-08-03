# API リファレンス

[English](api.md) | **日本語**

`require("rocas")` がエクスポートするすべての一覧です。CLI（[`bin/rocas.js`](../bin/rocas.js)）はこれらの関数の薄いラッパーなので、CLI でできることはすべてプログラムからも実行できます。

```javascript
const rocas = require("rocas");
```

- [共通のデータ形状](#共通のデータ形状) — [`Config`](#config)、[`Lock`](#lock)、[`Manifest`](#manifest)
- [設定](#設定) — [`loadEnv`](#loadenvcwd)、[`loadConfig`](#loadconfigcwd)
- [同期](#同期) — [`syncAll`](#syncallconfig-apikey-cwd)、[`EXT_TO_ASSET_TYPE`](#ext_to_asset_type)
- [監視](#監視) — [`watchAll`](#watchallconfig-apikey-options)
- [アップロード](#アップロード) — [`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator)
- [コード生成](#コード生成) — [`generateLuau`](#generateluaulock-varname-options)、[`generateDts`](#generatedtslock-varname-options)
- [コード生成フォーマット](#コード生成フォーマット) — [`registerCodegenFormat`](#registercodegenformatformat)、[`listCodegenFormats`](#listcodegenformats)、[`resolveCodegenFormat`](#resolvecodegenformatformatname)、[`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format)
- [ロックファイルとアセットマップ](#ロックファイルとアセットマップ) — [`lockPathForSync`](#lockpathforsyncsyncconfig-cwd)、[`loadLockForSync`](#loadlockforsyncsyncconfig-cwd)、[`buildAssetMap`](#buildassetmapconfig-cwd)、[`normalizeAssetPath`](#normalizeassetpathvalue)
- [Studio プラグインとマニフェスト](#studio-プラグインとマニフェスト) — [`writeStudioPlugin`](#writestudiopluginconfig-cwd-outputpath-options)、[`writeStudioManifest`](#writestudiomanifestconfig-cwd-outputpath-options) ほか低レベルヘルパー

## 共通のデータ形状

### `Config`

[`loadConfig`](#loadconfigcwd) が返す、`rocas.toml` のパース結果:

```javascript
{
  creator: {
    type: "user" | "group",   // デフォルト "user"
    id: 123456789,            // 必須
  },
  sync: [
    {
      name: "images",              // 必須 — ロックファイル名・生成される変数名
      path: "assets/images",       // 必須 — 再帰的にスキャンするディレクトリ
      output: "src/shared/images", // 任意 — コード生成の出力パス（拡張子はフォーマットが付与）
      assetType: "Decal",          // 任意 — 全ファイルの Roblox assetType を強制
      format: "luau",              // 任意 — コード生成フォーマット名（デフォルト "luau"）
      stripExtensions: false,      // 任意 — 生成キーからファイル拡張子を除去
    },
  ],
}
```

### `Lock`

同期ディレクトリ内に置かれる `<name>.lock.json` の内容。キーは同期ディレクトリからの相対パス（スラッシュ区切り）です:

```javascript
{
  "ui/button.png": {
    assetId: "12345678",     // 数値文字列。"rbxassetid://" プレフィックスなし
    hash: "…",               // ファイル内容の SHA-256
    config: "…",             // creator + assetType のフィンガープリント（16 進 16 文字。0.1.2 より前のロックには無い）
  },
}
```

### `Manifest`

[`buildStudioPluginManifest`](#buildstudiopluginmanifestconfig-cwd-options) が構築し、Studio プラグイン用のマニフェスト ModuleScript に埋め込まれるオブジェクト:

```javascript
{
  generatedBy: "rocas",
  mode: "uploaded" | "local",
  assets: [
    {
      group: "images",              // [[sync]] の name
      path: "ui/button.png",        // 同期ディレクトリからの相対パス
      name: "button.png",
      sourcePath: "assets/images/ui/button.png", // cwd からの相対パス
      assetType: "Decal",
      source: "uploaded" | "local",
      assetId: "rbxassetid://12345678", // uploaded モードのみ
      size: 4096,                       // local モードのみ（バイト）
    },
  ],
}
```

## 設定

### `loadEnv(cwd?)`

`cwd`（デフォルト `process.cwd()`）の `.env` を読み、各 `KEY=value` 行を `process.env` に代入します。`.env` が無ければ何もしません。値はダブルクォート可、`#` のコメント行は無視されます。

### `loadConfig(cwd?)`

`cwd` の `rocas.toml` を読み込んでパースし、[`Config`](#config) を返します。

`rocas.toml` が無い場合、または `[creator] id` が無い場合は throw します。`creator.type` のデフォルトは `"user"` です。

パーサーは意図的に小さく作られています: `[creator]`、繰り返しの `[[sync]]` テーブル、文字列 / 整数 / 真偽値の `key = value` に対応 — TOML 仕様全体には対応していません。

## 同期

### `syncAll(config, apiKey, cwd?)`

`async`。すべての `[[sync]]` グループを順番にフル同期します:

1. `sync.path` を再帰スキャン（ドットファイルと `*.lock.json` は除外）。
2. 各ファイルについて、**upload**（新規・内容変更・creator/assetType 設定の変更）、**skip**（ロックのハッシュと設定フィンガープリントが両方一致）、**rebaseline**（フィンガープリント導入前のロックと内容一致 — アップロードせずフィンガープリントだけ記録）のいずれかを決定。
3. 更新されたロックファイルを書き込み。
4. `sync.output` が設定されていればグループのフォーマットでコード生成し、内容が変わったファイルのみ書き込み。

ディレクトリが存在しないグループはログを出してスキップします。未対応の拡張子のファイル（かつ `assetType` 上書きなし）もスキップされます。

### `EXT_TO_ASSET_TYPE`

小文字の拡張子から Roblox アセットタイプへのマッピングオブジェクト。例: `{ ".png": "Decal", ".mp3": "Audio", ".fbx": "Model", ".rbxm": "Animation", ".mp4": "Video", … }`。グループに `assetType` の上書きが無い場合の自動判定に使われます。

## 監視

### `watchAll(config, apiKey, options?)`

監視を開始し、戻りません（プロセス終了まで実行。Ctrl-C はハンドリング済み）。

- 存在する各 `sync.path` を再帰的に監視し、変更があるとデバウンス付きで [`syncAll`](#syncallconfig-apikey-cwd) をスケジュールします。
- `rocas.toml` も監視し（エディタのアトミック保存を拾えるよう親ディレクトリ経由）、次の同期前に設定を再読み込みします — そのため creator の変更はフィンガープリントによる再アップロードを引き起こします。
- `options.debounce` — 最後の変更から同期までの待機ミリ秒。デフォルト `10000`。

設定されたディレクトリが 1 つも存在しない場合は終了コード 1 でプロセスを終了します。

## アップロード

### `uploadAsset(filePath, assetType, apiKey, creator)`

`async`。[Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets)（`POST apis.roblox.com/assets/v1/assets`）でファイルを 1 つアップロードし、返されたオペレーションを完了まで 2 秒間隔でポーリングします。

- `assetType` — `"Decal"`、`"Audio"`、`"Model"`、`"Animation"`、`"Video"` のいずれか。
- `creator` — `{ type: "user" | "group", id }`。
- アセット ID を**数値文字列**（`rbxassetid://` プレフィックスなし）で返します。
- 200 以外のレスポンスや失敗したオペレーションでは throw します。ファイルパートの `Content-Type` は拡張子から決まります。

## コード生成

組み込みフォーマットが使う低レベルレンダラーです。通常は[フォーマット](#コード生成フォーマット)を使う方が便利です。

### `generateLuau(lock, varName, options?)`

[`Lock`](#lock) を、`"rbxassetid://…"` 文字列のネストしたテーブルとして Luau ソースにして返します。

- `options.strict`（デフォルト `false`）— `--!strict`、生成された `<VarName>Type` 型、型注釈を出力。
- `options.stripExtensions`（デフォルト `false`）— キーからファイル拡張子を除去。

### `generateDts(lock, varName, options?)`

同じツリーに対応する TypeScript の `.d.ts` 宣言（`declare const <varName>: {…}; export = <varName>`）を返します。`options.stripExtensions` に対応。

## コード生成フォーマット

フォーマットはロックを 1 つ以上の出力ファイルに変換します。`rocas.toml` でグループごとに `format = "<name>"` で選択します。

### `registerCodegenFormat(format)`

フォーマットを登録（または置き換え）し、そのフォーマットを返します。フォーマットの形:

```javascript
{
  name: "json",
  render(lock, varName, options) {
    // options: { stripExtensions }
    return [{ extension: ".json", content: JSON.stringify(lock, null, 2) }];
  },
}
```

返り値の各エントリは、グループの `output` ベースパス + `extension` に書き出されます。`name` か `render` が無い場合は throw します。

### `listCodegenFormats()`

登録済みフォーマット名を返します。例: `["luau", "roblox-ts"]`。

### `resolveCodegenFormat(formatName?)`

`formatName` で登録されたフォーマットを返します。省略時は [`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format)。未知の名前の場合は既知フォーマットの一覧付きで throw します。

### `DEFAULT_CODEGEN_FORMAT`

`"luau"`。

組み込みフォーマット:

| 名前 | 出力 | 備考 |
|------|--------|-------|
| `luau` | `.luau` | `strict: true` の `generateLuau` |
| `roblox-ts` | `.luau` + `.d.ts` | 非 strict の Luau テーブル + 対応する型宣言ファイル |

## ロックファイルとアセットマップ

### `lockPathForSync(syncConfig, cwd?)`

グループのロックファイルの絶対パス: `<cwd>/<sync.path>/<sync.name>.lock.json`。

### `loadLockForSync(syncConfig, cwd?)`

グループのロックファイルをパースして [`Lock`](#lock) を返します。ファイルが無い場合は `{}`。

### `buildAssetMap(config, cwd?)`

全グループのロックを 1 つのルックアップ構造に集約します（`assetId` の無いエントリはスキップ）:

```javascript
{
  bySourcePath: { "C:/…/assets/images/ui/button.png": "rbxassetid://12345678" },
  byRelativePath: {
    "assets/images/ui/button.png": "rbxassetid://12345678", // cwd からの相対
    "ui/button.png": "rbxassetid://12345678",               // ロックキー（衝突時は先のグループが優先）
    "images/ui/button.png": "rbxassetid://12345678",        // "<グループ>/<ロックキー>"
  },
  groups: { images: { "ui/button.png": "rbxassetid://12345678" } },
}
```

パスはすべてスラッシュ区切りで、値は常に `rbxassetid://` プレフィックス付きです。

### `normalizeAssetPath(value)`

バックスラッシュをスラッシュに置き換えます。

## Studio プラグインとマニフェスト

Studio 連携は 2 つの成果物から成ります: Studio に一度だけインストールする**静的プラグイン**と、ロックファイルから再生成して（Rojo/Argon で）`ReplicatedStorage` に同期する**マニフェスト ModuleScript** です。プラグインは後者を読み取ります。ワークフローは [README](../README.ja.md#roblox-studio-プラグイン) を参照してください。

### `writeStudioPlugin(config, cwd?, outputPath?, options?)`

プラグインを生成して書き込みます（内容が変わったときのみ）。必要ならディレクトリも作成します。出力先の絶対パスを返します。

- `config` は未使用です — プラグインは静的なので `null` を渡してください。
- デフォルト出力先: [`defaultStudioPluginOutputPath`](#defaultstudiopluginoutputpathcwd-env-platform)（Studio のローカル Plugins フォルダ）。
- 出力パスの**拡張子がエンコーディングを決めます**: `.lua`/`.luau` → プラグインの生ソース、`.rbxmx` → XML モデル、それ以外 → バイナリ `.rbxm`。

### `writeStudioManifest(config, cwd?, outputPath?, options?)`

`config` からマニフェストを構築し、マニフェスト ModuleScript を書き込みます（内容が変わったときのみ）。出力先の絶対パスを返します。

- デフォルト出力先: `src/shared/RocasManifest.luau`。
- `options.local` — ロックファイルではなくディスク上のファイルから[ローカルモード](../README.ja.md#アップロードせずに閲覧する)のマニフェストを構築。

### `buildStudioPluginManifest(config, cwd?, options?)`

何も書き込まずに [`Manifest`](#manifest) オブジェクトを返します。

- uploaded モード（デフォルト）: 各グループのロックファイルを読みます。ロックの無いグループはスキップ。
- local モード（`options.local`）: 各グループのディレクトリを再帰スキャンします。未対応の拡張子のファイルはスキップされ、エントリは `assetId` の代わりに `size` を持ちます。
- アセットはグループ、次にパスでソートされます。

### `generateManifestModule(manifest)`

マニフェスト ModuleScript のソースを返します: 埋め込まれたマニフェスト JSON を `HttpService:JSONDecode` する Luau モジュールです。

### `generateStudioPlugin()`

静的 Studio プラグインの Luau ソースをそのまま返します。

### `generateStudioPluginRbxm(source?)` / `generateStudioPluginRbxmx(source?)`

プラグインソース（デフォルト: `generateStudioPlugin()`）を、`rocas` という名前の `Script` を 1 つ含むバイナリ `.rbxm` バッファ / XML `.rbxmx` 文字列にラップします。

### `robloxStudioPluginsDir(env?, platform?)`

Roblox Studio のローカル Plugins フォルダ: Windows では `%LOCALAPPDATA%\Roblox\Plugins`、それ以外では `~/Documents/Roblox/Plugins`、どちらの環境変数も無い場合は `null`。

### `defaultStudioPluginOutputPath(cwd?, env?, platform?)`

`<Plugins フォルダ>/rocas-studio-plugin.rbxm`。Plugins フォルダを特定できない場合は `cwd` にフォールバックします。

### `resolveStudioPluginOutputPath(cwd?, outputPath?)` / `resolveManifestOutputPath(cwd?, outputPath?)`

明示された出力パスを `cwd` 基準で解決し、無ければそれぞれのデフォルトを返します。
