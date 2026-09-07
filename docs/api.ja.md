# API リファレンス

[English](api.md) | **日本語**

`require("@plumvery/rocas")` がエクスポートするすべての一覧です。CLI（[`bin/rocas.js`](../bin/rocas.js)）はこれらの関数の薄いラッパーなので、CLI でできることはすべてプログラムからも実行できます。

```javascript
const rocas = require("@plumvery/rocas");
```

- [共通のデータ形状](#共通のデータ形状) — [`Config`](#config)、[`Lock`](#lock)、[`Manifest`](#manifest)
- [設定](#設定) — [`loadEnv`](#loadenvcwd)、[`loadConfig`](#loadconfigcwd)
- [同期](#同期) — [`syncAll`](#syncallconfig-apikey-cwd-options)、[`syncOne`](#synconesyncconfig-creator-apikey-cwd-options)、[`needsImageId`](#needsimageidentry-assettype)、[`EXT_TO_ASSET_TYPE`](#ext_to_asset_type)、[`CONVERTED_EXT_TO_ASSET_TYPE`](#converted_ext_to_asset_type)
- [監視](#監視) — [`watchAll`](#watchallconfig-apikey-options)
- [アップロード](#アップロード) — [`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator)、[`updateAsset`](#updateassetassetid-filepath-assettype-apikey-creator)
- [取得](#取得) — [`fetchAll`](#fetchallconfig-apikey-cwd-options)、[`fetchAssetContent`](#fetchassetcontentassetid-options)
- [Image ID](#image-id) — [`fetchDecalImageId`](#fetchdecalimageiddecalid-options)、[`extractImageIdFromAssetBody`](#extractimageidfromassetbodybody)
- [コード生成](#コード生成) — [`generateLuau`](#generateluaulock-varname-options)、[`generateDts`](#generatedtslock-varname-options)
- [コード生成フォーマット](#コード生成フォーマット) — [`registerCodegenFormat`](#registercodegenformatformat)、[`listCodegenFormats`](#listcodegenformats)、[`resolveCodegenFormat`](#resolvecodegenformatformatname)、[`DEFAULT_CODEGEN_FORMAT`](#default_codegen_format)
- [ロックファイルとアセットマップ](#ロックファイルとアセットマップ) — [`lockPathForSync`](#lockpathforsyncsyncconfig-cwd)、[`loadLockForSync`](#loadlockforsyncsyncconfig-cwd)、[`resolveEntryAssetId`](#resolveentryassetidentry)、[`buildAssetMap`](#buildassetmapconfig-cwd)、[`normalizeAssetPath`](#normalizeassetpathvalue)
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
      resolveImageIds: true,       // 任意 — Decal ID から Image ID を解決（デフォルト true）
    },
  ],
}
```

### `Lock`

同期ディレクトリ内に置かれる `<name>.lock.json` の内容。キーは同期ディレクトリからの相対パス（スラッシュ区切り）です:

```javascript
{
  "ui/button.png": {
    assetId: "12345679",     // 数値文字列。"rbxassetid://" プレフィックスなし
    imageId: "12345678",     // 画像のみ — Decal の中身の Image ID。未解決なら無い
    hash: "…",               // ファイル内容の SHA-256
    config: "…",             // creator + assetType のフィンガープリント（16 進 16 文字。0.1.2 より前のロックには無い）
  },
}
```

画像の `assetId` は Open Cloud が返した **Decal** の ID で、`imageId` はその中身の Image ID です。ロックを読む側はすべて [`resolveEntryAssetId`](#resolveentryassetidentry) を通し、`imageId` を優先します。

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

### `syncAll(config, apiKey, cwd?, options?)`

`async`。すべての `[[sync]]` グループを順番にフル同期します:

1. `sync.path` を再帰スキャン（ドットファイルと `*.lock.json` は除外）。
2. 各ファイルについて、**upload**（新規・creator/assetType 設定の変更・その場で更新できない型の内容変更）、**update**（Open Cloud が内容更新に対応する型の内容変更 — 同じアセット ID のまま新しいバージョン）、**skip**（ロックのハッシュと設定フィンガープリントが両方一致）、**rebaseline**（フィンガープリント導入前のロックと内容一致 — アップロードせずフィンガープリントだけ記録）のいずれかを決定。
3. `imageId` を持たない `Decal` エントリの [Image ID](#fetchdecalimageiddecalid-options) を解決。skip / rebaseline したエントリも対象なので、既存ロックは再アップロードなしで補完されます。グループに `resolveImageIds = false` を指定すると無効化されます。
4. 更新されたロックファイルを書き込み。
5. `sync.output` が設定されていればグループのフォーマットでコード生成し、内容が変わったファイルのみ書き込み。

ディレクトリが存在しないグループはログを出してスキップします。未対応の拡張子のファイル（かつ `assetType` 上書きなし）もスキップされます。[変換される形式](#converted_ext_to_asset_type)（`.fbx` など）も同様で、これらはグループで `assetType` を明示しない限り通りません。

Image ID の解決が失敗しても同期は止まりません。警告を出して Decal ID を残し、次回の実行で再試行します。3 回連続で失敗するとそのグループの残りではスキップします。

- `options.resolveImageId` — `(decalId, apiKey) => Promise<string>`。[`fetchDecalImageId`](#fetchdecalimageiddecalid-options) の差し替え。主にテストやオフライン実行用。

### `syncOne(syncConfig, creator, apiKey, cwd?, options?)`

`async`。`syncAll` の単一グループ版。`[[sync]]` エントリ 1 つと `creator` を直接受け取ります。

### `needsImageId(entry, assetType)`

[`Lock`](#lock) エントリがアップロード済みの `Decal` で、まだ `imageId` を持っていない場合に `true`。

### `EXT_TO_ASSET_TYPE`

小文字の拡張子から Roblox アセットタイプへのマッピングオブジェクト。例: `{ ".png": "Decal", ".mp3": "Audio", ".rbxm": "Model", ".mp4": "Video", … }`。グループに `assetType` の上書きが無い場合の自動判定に使われます。`.rbxm` / `.rbxmx` は `Model` です（取得で往復できる唯一の形式のため）。アニメーションを置くグループには `assetType = "Animation"` が必要です。

### `CONVERTED_EXT_TO_ASSET_TYPE`

`{ ".fbx": "Model", ".glb": "Model", ".gltf": "Model", ".obj": "Model" }` — アップロード時に Roblox が変換してしまう形式。上げると出来上がるのは `Model` で、元のファイルは取り戻せないため [`fetchAll`](#fetchallconfig-apikey-cwd-options) では復元できません。これらを `EXT_TO_ASSET_TYPE` に **入れていない** のは意図的で、同期するにはグループで `assetType = "Model"` を指定する必要があります。「このファイルは何か」を説明する側（Studio マニフェストが `.fbx` を `Model` と呼ぶなど）では引き続きこの表を使います。

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
- 画像の場合、返るのは **Decal** の ID です — [`fetchDecalImageId`](#fetchdecalimageiddecalid-options) を参照。

### `updateAsset(assetId, filePath, assetType, apiKey, creator)`

`async`。既存アセットの内容を差し替え（`PATCH apis.roblox.com/assets/v1/assets/{assetId}`）、[`uploadAsset`](#uploadassetfilepath-assettype-apikey-creator) と同じ方法でオペレーションをポーリングします。アセット ID は変わらず、Roblox 側に新しいバージョンが記録されます。

- 内容を更新できるのは `Model` だけです（バイナリの `.rbxm` を含む）。`Audio`・`Decal`・`Mesh`・`Video` は更新不可と明記されており、`Animation` も更新可能とは書かれていません — これらには Roblox が `400` を返します。[`syncAll`](#syncallconfig-apikey-cwd-options) はそれらを新規アップロードに回します。
- 2026-09-04 に実 API で確認: バイナリ `.rbxm` から作成したグループ所有の `Model`（`revisionId` 1）をこのエンドポイントで 2 回更新し、いずれも `200` が返り、アセット ID は据え置きのまま `revisionId` が 2、3 と増えました。
- `updateMask` を送らないので、変わるのはファイルの内容だけです — `displayName` と `description` はそのまま残ります。
- 同じエンドポイントはメタデータだけの更新もできます。`?updateMask=displayName,description` を **`fileContent` パート無し**で投げると `200` が返り、内容のリビジョンは増えません（リファレンスは両方のパートを必須と書いていますが、実際には通ります。2026-09-04 実測）。rocas はこの形を使いません。
- `uploadAsset` に合わせて `assetId` を**数値文字列**で返します。
- 200 以外のレスポンスや失敗したオペレーションでは throw します。

> [!NOTE]
> Roblox の[アセットガイド](https://create.roblox.com/docs/cloud/guides/usage-assets)は内容更新を `.fbx` に限ると書いていますが、この記述は誤りです（少なくとも 2026-09-04 時点では古い情報です）。実際の挙動と一致するのは [Assets API リファレンス](https://create.roblox.com/docs/cloud/reference/AssetsApi) のほうで、Model 全般で内容を更新できます。

## 取得

### `fetchAll(config, apiKey, cwd?, options?)`

`async`。[`syncAll`](#syncallconfig-apikey-cwd-options) の逆向き。各グループのロックファイルを読み、載っているアセットをダウンロードします。

各エントリは [`resolveEntryAssetId`](#resolveentryassetidentry) で解決するため、画像は包んでいる Decal ではなく `imageId` で取得されます。ファイル名は `<assetId>.<ext>` で、拡張子はロックのキーではなく **返ってきた中身** から決めます（`.fbx` を上げたものは Roblox が組み立てた `.rbxm` として返るため）。同じディレクトリの `<group>.fetch.json` にロックのキーごとの `{ assetId, hash, file }` を記録し、`assetId` と `hash` が一致していてファイルも残っているエントリは取り直しません。

- `options.out` — 出力先ディレクトリ。`cwd` からの相対で解決。既定は `.rocas-cache`。
- `options.groups` — 対象を絞る `[[sync]]` 名の配列。知らない名前があれば throw します。
- `options.fetchContent` — `(assetId, apiKey) => Promise<Buffer>`。[`fetchAssetContent`](#fetchassetcontentassetid-options) の差し替え。主にテストやオフライン実行用。
- 戻り値は `{ outDir, fetched, reused, failed }`。

1 件失敗しても実行は止まりません。警告を出して `failed` に数えます。3 回連続で失敗するとそのグループの残りはスキップします。

> [!WARNING]
> 出力先は必ずどの `sync.path` の **外** にしてください。ダウンロードしたファイルは元ファイルとバイト一致しないため、次の同期が「変わった」と判定します。`Model` ならその場で更新されるだけですが、`Decal` / `Audio` / `Video` は新規アップロードになり **assetId が変わります**。`options.out` が `path` の中に落ちる場合は `fetchAll` が警告し、既定の出力先が中に入ることはありません。

### `fetchAssetContent(assetId, options?)`

`async`。アセット 1 件をダウンロードして本体を `Buffer` で返します。素の ID でも `rbxassetid://…` 文字列でも受け付けます。

返ってくるのはアップロードしたファイルではなく **Roblox が保持している形** です。`Model` は MeshPart 化済みの `.rbxm`、画像は画像のバイト列（したがって渡すのは Decal ID ではなく Image ID）。経路は [`fetchDecalImageId`](#fetchdecalimageiddecalid-options) と同じ 2 ホップで、Open Cloud → 旧 assetdelivery のフォールバックと gzip 展開もそのまま共有しています。

- `options.apiKey` — Open Cloud API キー。Assets の **読み取り** 権限が必要。
- `options.version` — 版の固定（`.../assetId/{id}/version/{n}`）。
- `options.attempts`（既定 `3`）/ `options.retryDelayMs`（既定 `2000`）— アップロード直後は配信が間に合わないことがあるため。
- `options.fetchAsset` — `(url, headers) => Promise<Buffer|string>`。内蔵フェッチャの差し替え。
- すべてのエンドポイントが失敗した場合は throw します。

```javascript
const { fetchAssetContent } = require("@plumvery/rocas");

const rbxm = await fetchAssetContent("123456789", { apiKey });
const older = await fetchAssetContent("123456789", { apiKey, version: 3 });
```

## Image ID

### `fetchDecalImageId(decalId, options?)`

`async`。`Decal` アセットをダウンロードし、その中身の Image ID を**数値文字列**で返します（`ImageLabel.Image` などが要求する値）。裸の ID でも `rbxassetid://…` 形式でも受け付けます。

アセット配信は「JSON で場所を引く → CDN から gzip された本体を取る」の 2 ホップで、次の順に試します:

1. `apis.roblox.com/asset-delivery-api/v1/assetId/{id}` に `x-api-key` ヘッダー付き — `options.apiKey` がある場合のみ。
2. `assetdelivery.roblox.com/v1/assetId/{id}` を認証なしで — 古い公開アセット向けのフォールバック。2025年4月以降、認証なしのアセット配信はほとんどの資産で拒否されるため、これ単独で成功することは稀です。

- `options.apiKey` — Open Cloud API キー。Assets の**読み取り**権限が必要。
- `options.attempts`（デフォルト `3`）/ `options.retryDelayMs`（デフォルト `2000`）— アップロード直後はまだ配信されないことがあるため。
- `options.fetchAsset` — `(url, headers) => Promise<Buffer|string>`。組み込みの取得処理を差し替えます。
- すべてのエンドポイントが失敗した場合、または本体に Image ID が無かった場合は throw します。

### `extractImageIdFromAssetBody(body)`

ダウンロードした Decal から Image ID を取り出します。`Texture` プロパティを優先し、無ければ本体内で最初に見つかったアセット URL にフォールバックします。XML / バイナリどちらのモデル形式にも対応。見つからない場合は `null` を返します。

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

### `resolveEntryAssetId(entry)`

[`Lock`](#lock) エントリを実際に参照すべき ID。`imageId` があればそれ、無ければ `assetId`、どちらも無ければ `null`。コード生成・[`buildAssetMap`](#buildassetmapconfig-cwd)・Studio マニフェストが使います。

### `buildAssetMap(config, cwd?)`

全グループのロックを 1 つのルックアップ構造に集約します（使える ID の無いエントリはスキップ）:

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
