<div align="center">

<h1>rocas</h1>

**Roblox Open Cloud Asset Sync**

画像・サウンド・メッシュ・アニメーション・動画を
[Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets) 経由で Roblox にアップロードし、
型付きの Luau / roblox-ts バインディングを自動生成します。

[![CI](https://img.shields.io/github/actions/workflow/status/Plumvery/rocas/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/Plumvery/rocas/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2018-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Roblox Open Cloud](https://img.shields.io/badge/Roblox-Open%20Cloud-00A2FF?style=flat-square&logo=roblox&logoColor=white)](https://create.roblox.com/docs/cloud/guides/usage-assets)
[![Output](https://img.shields.io/badge/output-Luau%20%7C%20roblox--ts-1D1D1D?style=flat-square)](#format)

[クイックスタート](#クイックスタート) ·
[CLI](#cli) ·
[設定](#設定) ·
[Studio プラグイン](#roblox-studio-プラグイン) ·
[生成される出力](#生成される出力) ·
[API リファレンス](docs/api.ja.md)

[English](README.md) | **日本語**

</div>

---

`assets/` にファイルを置いて `rocas sync` を実行すれば、完全な型安全付きで require できます:

```lua
local images = require(ReplicatedStorage.Shared.images)

imageLabel.Image = images.ui.button --> "rbxassetid://12345678"
```

アセット ID の手動コピペも、古くなった ID も、型のない文字列テーブルも不要です。

## 特徴

- **全アセットタイプ対応** — 画像・サウンド・メッシュ・アニメーション・動画
- **ハッシュベースの変更検知** — 実際に変わったものだけをアップロードし、ロックファイルで管理
- **設定変更を検知して再同期** — `rocas.toml` の creator や `assetType` が変わると、ファイル内容が同一でも再アップロード
- **Model の ID は据え置き** — 同期済みの `Model` を編集しても、新しい ID を振らずに既存アセットを更新
- **取り戻せる** — `rocas fetch` でロックファイルが指すアセットをダウンロード。リポジトリにはアセット本体ではなく ID だけを置ける
- **ディレクトリの再帰スキャン** — ネストしたフォルダはネストした生成オブジェクトに
- **Luau ネイティブがデフォルト** — `--!strict` の型注釈付き `.luau` を生成
- **roblox-ts 互換** — オプトインで Asphalt 風の `.luau` + `.d.ts` ペアを出力
- **Studio プラグイン** — Studio を離れずに同期済みアセットの閲覧・検索・プレビュー・挿入
- **ローカルプレビューモード** — Open Cloud API キーなしでローカルアセットを Studio で閲覧
- **CLI + ライブラリ** — `rocas sync` でも `require("@plumvery/rocas")` でも

## 動作要件

| | |
|---|---|
| **Node.js** | 18 以上 |
| **Roblox Open Cloud API キー** | `sync`・`watch`・`fetch` に必要。[Creator Dashboard](https://create.roblox.com/dashboard/credentials) で、対象ユーザーまたはグループの Assets 読み書き権限を付けて作成してください。**読み取り** 権限は [Image ID](#image-id) の解決と [`rocas fetch`](#アセットを取り戻す) のダウンロードに使われます。 |

> [!NOTE]
> `rocas plugin` と `rocas manifest --local` は完全オフラインで動作します — API キー不要。

## インストール

グローバルに CLI として:

```bash
npm install -g @plumvery/rocas
```

またはプロジェクトの devDependency として:

```bash
npm install --save-dev @plumvery/rocas
```

> [!NOTE]
> パッケージ名はスコープ付きですが、入るコマンドは `rocas` のままです。スコープ無しの名前は、既存パッケージと紛らわしいとして npm レジストリに拒否されました。

> [!NOTE]
> **npm 12 では `rocas plugin` だけ一手間かかります。** npm 12 は依存の install スクリプトをプロジェクトが承認しない限りブロックするため、`rbxm-parser` が必要とするネイティブモジュール `lz4` がビルドされません。他のコマンドはそれ無しで動きます。困るのは Studio プラグインを `.rbxm` で書き出すときだけです。一度承認するか、
>
> ```bash
> npm install-scripts approve lz4
> ```
>
> ネイティブコードの要らない XML で書き出してください: `rocas plugin --output rocas-studio-plugin.rbxmx`

## クイックスタート

**1. プロジェクトルートに `rocas.toml` を作成**

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

**2. API キーを `.env` に追加**

```env
ROCAS_API_KEY="your-open-cloud-api-key"
```

> [!TIP]
> `.env` が `.gitignore` に入っていることを確認してください。Open Cloud API キーは絶対にコミットしないこと。

**3. 同期**

```bash
rocas sync
```

アセットがアップロードされ、結果のアセット ID を含む `src/shared/images.luau` + `src/shared/sounds.luau` が生成されます。

**4. 作業中は起動しっぱなしに**

```bash
rocas watch
```

## CLI

| コマンド | 説明 |
|---------|-------------|
| `rocas sync` | 変更されたアセットをアップロードし、バインディングを再生成 |
| `rocas watch` | アセットディレクトリと `rocas.toml` を監視し、変更時に同期 |
| `rocas fetch` | ロックファイルに載っているアセットをダウンロード |
| `rocas plugin` | 静的な Roblox Studio プラグインを生成 |
| `rocas plugin --module` | プラグイン本体をプロジェクト内の ModuleScript として生成 |
| `rocas plugin --loader` | そのモジュールを require する一度きりのローダーを設置 |
| `rocas manifest` | ロックファイルから `ReplicatedStorage` マニフェスト ModuleScript を生成 |
| `rocas help` | ヘルプを表示 |

### オプション

| フラグ | 対象 | デフォルト | 説明 |
|------|-----------|---------|-------------|
| `--debounce <ms>` | `watch` | `10000` | 同期実行までのデバウンス間隔 |
| `--group <name>` | `fetch` | 全グループ | この `[[sync]]` グループだけを取得。複数指定可 |
| `--out`, `-o <dir>` | `fetch` | `.rocas-cache` | ダウンロード先 |
| `--output`, `-o <path>` | `plugin` | Studio のローカル Plugins フォルダ | プラグインの出力先 |
| `--output`, `-o <path>` | `manifest` | `src/shared/RocasManifest.luau` | マニフェストモジュールの出力先 |
| `--local` | `manifest` | — | ロックファイルではなくローカルファイルから生成。アップロードも API キーも不要 |

### 環境変数

| 変数 | 説明 |
|----------|-------------|
| `ROCAS_API_KEY` | Roblox Open Cloud API キー。`.env` に書くかシェルで export。 |

## 対応フォーマット

| タイプ | 拡張子 | Roblox `assetType` |
|------|------------|--------------------|
| 画像 | `.png` `.jpg` `.jpeg` `.bmp` `.tga` | `Decal` |
| 音声 | `.mp3` `.ogg` `.wav` `.flac` | `Audio` |
| モデル | `.rbxm` `.rbxmx` | `Model` |
| メッシュ | `.fbx` `.glb` `.gltf` `.obj` | `Model` — `allowConvertedFormats` が必要 |
| 動画 | `.mp4` `.mov` | `Video` |

アセットタイプはファイル拡張子から自動判定され、グループごとに `assetType` で上書きできます。

> [!IMPORTANT]
> メッシュ形式は自動判定の対象では **ありません**。`.fbx` / `.glb` / `.gltf` / `.obj` はアップロード時に Roblox が `Model` へ変換し、元のファイルは返ってきません。つまり [`rocas fetch`](#アセットを取り戻す) では戻せないので、グループが明示的に許可しない限り理由を添えて skip します。
>
> ```toml
> [[sync]]
> name = "meshes"
> path = "assets/meshes"
> allowConvertedFormats = true   # これが無いと .fbx は skip される
> ```
>
> `assetType` では通りません。あれは「どの型で上げるか」の指定です。許可を別のスイッチに分けてあるのは、別の理由で `assetType` を書いた人が、片道アップロードまで知らずに有効にしてしまわないようにするためです。

アニメーションも `.rbxm` で書き出されますが、`.rbxm` は `Model` として同期されます。アニメーションのグループはその旨を明示してください。

```toml
[[sync]]
name = "animations"
path = "assets/animations"
assetType = "Animation"
```

> [!WARNING]
> `.rbxm` / `.rbxmx` の既定は以前は `Animation` でした。`assetType` を明示せずにこれらを同期してきたグループは、次の `rocas sync` で assetType の変更が設定変更として扱われ、**すべて新しい `Model` として再アップロードされて assetId が変わります**。以前の挙動と ID を保つには、同期する前にグループへ `assetType = "Animation"` を指定してください。

### Image ID

Open Cloud は画像を `Decal` アセットとしてアップロードするため、返ってくる ID は中身の画像ではなく **Decal** の ID です。Decal ID は `Decal.Texture` では使えますが、`ImageLabel.Image` や `ImageButton.Image`、`ParticleEmitter.Texture` などは **Image** の ID を要求します。

そこで rocas は画像アップロード後に Decal をダウンロードして中身の Image ID を読み取り、ロックファイルへ `imageId` として保存します。生成コード・アセットマップ・Studio マニフェストはいずれも `imageId` を優先し、無い場合だけ Decal ID にフォールバックします。

```json
{
  "ui/button.png": { "assetId": "12345679", "imageId": "12345678", "hash": "…", "config": "…" }
}
```

これには Assets の **読み取り** 権限を持つ API キーが必要です（2025年4月以降、Roblox のアセット配信は認証必須になりました）。既存のロックファイルにある画像は、次回の `rocas sync` で再アップロードなしに補完されます。

> [!NOTE]
> 解決の失敗で sync が止まることはありません。読み取れなかった場合（審査中、キーの読み取り権限不足など）は警告を出して Decal ID のまま残し、次回の sync で再試行します。3 回連続で失敗するとそのグループの残りは解決を諦めます。グループに `resolveImageIds = false` を指定すれば完全に無効化できます。

## 設定

### `rocas.toml`

```toml
[creator]
type = "user"       # "user" または "group"
id = 123456789      # Roblox ユーザー ID またはグループ ID

[[sync]]
name = "images"              # グループ名。images.lock.json に使われる
path = "assets/images"       # 再帰的にスキャンするディレクトリ
output = "src/shared/images" # デフォルトでは images.luau を生成
# assetType = "Decal"        # 任意: アセットタイプを強制
# format = "luau"            # "luau"（デフォルト）または "roblox-ts"
# stripExtensions = false    # 生成キーからファイル拡張子を除去
# resolveImageIds = true     # Decal ID から Image ID を解決（デフォルト true）
# allowConvertedFormats = true # 取り戻せない .fbx/.glb/.gltf/.obj を許可する
```

コメント付きの完全なリファレンスは [`rocas.toml.example`](rocas.toml.example) を参照してください。

### `format`

| 値 | 出力 | 説明 |
|-------|--------|-------------|
| `"luau"` *(デフォルト)* | `.luau` | `--!strict` の型注釈付き出力 |
| `"roblox-ts"` | `.luau` + `.d.ts` | roblox-ts / Asphalt 互換の出力 |

### `stripExtensions`

`true` にすると、生成キーからファイル拡張子が除去されます:

```lua
-- stripExtensions = false (デフォルト)
images.ui["button.png"]

-- stripExtensions = true
images.ui.button
```

## 変更検知

rocas は各同期ディレクトリの中に `<name>.lock.json` を保持します（例: `assets/images/images.lock.json`）。アセットが**スキップ**されるのは、次の両方がロックと一致したときだけです:

1. ファイル内容のハッシュ
2. アップロードに影響する `rocas.toml` 設定のフィンガープリント（`[creator]` の `type`/`id` と解決後の `assetType`）

> [!IMPORTANT]
> `rocas.toml` の creator を変えた場合 — たとえば `[creator].id` をグループから自分のユーザーに変更した場合 — 次の `rocas sync` は、ファイル自体が変わっていなくても、影響する全アセットを新しい creator で再アップロードします。

### その場での更新

変わったのがファイルの内容だけで、creator と `assetType` はロックと一致している場合、rocas は新規作成ではなく既存アセットを更新します。生成コードの中の ID はそのままで、Roblox 側には以前の内容がバージョンとして残ります。

対象は `Model` だけです。Open Cloud は `Audio`・`Decal`・`Mesh`・`Video`・`Animation` の内容更新に対応していないので、これらを編集した場合は従来どおり新しい ID で新規アップロードになります。

> [!NOTE]
> `.rbxm` と `.rbxmx` の既定の assetType は `Model` なので、編集すると既存アセットがその場で更新されます。バイナリの `.rbxm` でも更新できます（2026-09-04 に実 API で確認）。Roblox の[アセットガイド](https://create.roblox.com/docs/cloud/guides/usage-assets)は今も内容更新を `.fbx` に限ると書いていますが、実際には通ります。アニメーションを置いているグループには `assetType = "Animation"` が必要で、そちらは編集のたびに新規アップロードになります。

`output`・`format`・`stripExtensions` の変更はコード生成にのみ影響し、再アップロードは発生しません。`rocas watch` は `rocas.toml` 自体も監視するので、設定を保存すると再読み込みして同期が走ります。

<details>
<summary><b>フィンガープリント導入前のバージョンからのアップグレード</b></summary>

<br>

旧バージョンの rocas が書いたロックエントリには設定フィンガープリントがありません。アップグレード後の最初の同期では、現在の設定をベースラインとして**再アップロードなしで**記録するため、アップグレードだけでアセット ID が入れ替わることはありません。

強制的に全アセットを再アップロードしたい場合 — たとえばフィンガープリント導入前のロックのまま creator を変更していた場合 — は、該当する `*.lock.json` を削除して `rocas sync` を実行してください。

</details>

## アセットを取り戻す

`rocas fetch` は `sync` の逆向きです。ロックファイルを読み、そこに載っているアセットをダウンロードします。

```bash
rocas fetch                     # 全グループ
rocas fetch --group models      # グループ指定
rocas fetch --out .rocas-cache  # 出力先の指定
```

ファイル名は `<assetId>.<ext>` で、何を落としたかは同じディレクトリの `<group>.fetch.json` に記録されます。拡張子は元のファイル名ではなく **返ってきた中身** から決めます。両者は一致するとは限らないためです — 画像は画像のまま返りますが、`.fbx` は Roblox が組み立てた `.rbxm` として返ります。ロックの `assetId` と `hash` が変わっておらず、ファイルも残っていれば取り直しません。

これによって、アセット本体をリポジトリから外せます。ロックファイルだけをコミットして実体を gitignore し、clone 後に `rocas fetch` を一発叩く、という形です。ただし制約が 2 つあります。

> [!WARNING]
> **sync の `path` の中へ落とさないこと。** ダウンロードしたファイルは元ファイルとバイト一致しないため、次の `rocas sync` が「変わった」と判定します。`Model` なら無駄なアップロードが走るだけですが、`Decal` / `Audio` / `Video` は **新しい assetId** が振られ、既存の参照が全部壊れます。既定の出力先がどの `path` の外にもあるのはこのためで、`--out` が `path` の中を指していると警告します。

> [!NOTE]
> **メッシュの元ファイルは戻りません。** `.fbx`（`.glb` / `.gltf` / `.obj` も同じ）を上げると出来上がるのは `Model` で、元のファイルは残りません。往復できるのは `.rbxm` / `.rbxmx` だけなので、実体をリポジトリから外したいなら、モデルの書き出しを `.rbxm` に寄せてください。追加の設定は要らず、そのまま `Model` として同期されます。

単体のアセットは [`fetchAssetContent`](docs/api.ja.md#fetchassetcontentassetid-options) が本体をそのまま返します。

```javascript
const { fetchAssetContent } = require("@plumvery/rocas");

const rbxm = await fetchAssetContent(assetId, { apiKey });
const older = await fetchAssetContent(assetId, { apiKey, version: 3 });
```

## Roblox Studio プラグイン

プラグインは一度だけ生成します:

```bash
rocas plugin
```

プラグインは静的です — アセットが変わっても再生成する必要はありません。

> [!NOTE]
> Studio はローカルプラグインとして `.luau` ファイルを認識しないため、デフォルトでは生成した `.rbxm` を Roblox Studio のローカル Plugins フォルダに直接書き込みます。別の場所に出力したい場合は `--output <path>` を指定してください。`.lua` と `.rbxmx` の出力パスにも対応しています。

### 同期済みアセットの閲覧

事前に焼く必要はありません。プラグインは `rocas sync` が生成するバインディングモジュール（Rojo や Argon が既に `ReplicatedStorage` へ同期しているもの）を読みます。変数名がアセットの種類を示し（`images` → Decal、`sounds` → Audio、`animations` → Animation、`maps` → Model）、ネストしたキーがそのままアセットのパスになります。

これらのモジュールはロックファイルから生成されるため、ブラウザには**同期済みアセットが全件**並びます。どのスクリプトからも参照されていないアセットも `Used in 0` として表示されます。使用回数で行を絞り込むことはありません。

読むのは rocas が生成したモジュールだけです。他の場所に手書きされた `rbxassetid://` は意図的に無視します。これは rocas が同期したアセットを見るためのブラウザであり、任意の ID まで拾うと別物になってしまうためです。

ブラウザではアセットの検索・画像プレビュー・アセット ID の確認ができ、**Insert** をクリックすると現在のプレイスに参照を配置できます。Rojo や Argon が変更を同期すると自動的に再スキャンします。

行は、そのネストしたパスから組み立てた**折りたたみ可能なフォルダツリー**にまとまります。フォルダには配下のアセット数が再帰集計で付きます。既定は折りたたみで、検索ボックスに入力すると全部展開されるため、一致がフォルダの中に隠れることはありません。同じフォルダ内はアルファベット順です。

各行のプレビュー枠の表示:

| 種類 | プレビュー |
|---|---|
| Decal | 画像そのもの |
| Model・Animation | Roblox 側のサムネイル (`rbxthumb://type=Asset`) |
| Audio | 再生／停止ボタン。押すと Studio 上で試聴できます |
| その他 | 種類の色 + 頭文字 |

サムネイルの背面には常に種類色の四角が残るので、サムネイルが無い・読み込み中のアセットでも種類が分かります。

> [!NOTE]
> アセットが出るのは、そのグループの生成モジュールが `ReplicatedStorage` に同期されてからです。コード生成の出力先を別の場所にしている場合や、グループを追加してから `rocas sync` を実行していない場合、そのグループは一覧に出ません。

焼いたマニフェストも引き続き使えます。`rocas.toml` 由来のグループ・ソースパス・宣言されたアセット種別を持つぶん、ある場合はそちらが優先されます:

```bash
rocas manifest --output src/shared/RocasManifest.luau
```

同じ ID のアセットはマニフェストの内容で上書きされ、マニフェストに無いものはスキャン結果のまま残ります。

### プラグイン本体をプロジェクトに置く

焼いたプラグインファイルの代わりに、リポジトリ内に置く ModuleScript として書き出せます:

```bash
rocas plugin --module
```

`src/server/RocasPlugin.luau` に出力されます (ServerStorage 側。プラグインのコードが本番クライアントへ配信されないようにするため)。Rojo や Argon でプレースへ同期したうえで、ローダーを**一度だけ**入れます:

```bash
rocas plugin --loader
```

ローダーは `ServerStorage` か `ReplicatedStorage` から `RocasPlugin` ModuleScript を探して require し、自分が持つツールバーボタンとドックウィジェットを渡すだけの小さなプラグインです。プロジェクト側でモジュールを編集して Rojo が同期すれば、その場でウィンドウが作り直されます。焼き直しも Studio の再起動も不要です。

> [!NOTE]
> ローダー自体は Studio のローカル Plugins フォルダに置く必要があります。`plugin` グローバルはそこから読み込まれたプラグインにしか存在しないためです。ただし rocas 側のロジックを一切持たないので、一度入れれば以後の更新は不要です。Studio が公式に案内している手順 (ServerStorage のスクリプトから「ローカルプラグインとして保存」) は変更のたびにそのフォルダへコピーを作るもので、ここで避けたい焼き直しそのものです。

さらに Studio 内の `Script`・`LocalScript`・`ModuleScript` のソース変更を監視し、スクリプト中に一致するアセット ID・パス・ファイル名が現れると各アセットの使用回数を更新します。

### アップロードせずに閲覧する

```bash
rocas manifest --local --output src/shared/RocasManifest.luau
```

ローカルマニフェストは `rocas.toml` のアセットフォルダを直接スキャンし、`ROCAS_API_KEY` を必要としません。Studio では **Import** をクリックして対象ファイルを選ぶか、行ごとの **Load** を使います。

> [!WARNING]
> ローカルモードは `File:GetTemporaryId()` と `rbxtemp://` ID を使います。これらの参照は現在の Studio セッションでのみ有効です — 共有されず、恒久的な Roblox アセットとしても保存されません。チーム・共有・ランタイム用途で永続的な `rbxassetid://` ID が必要な場合は `rocas sync` + `rocas manifest` を使ってください。

<details>
<summary><b>アセットタイプごとの <code>Insert</code> の挙動</b></summary>

<br>

| アセットタイプ | 挿入先 |
|------------|---------------|
| Decal / Image | 選択中の `BasePart` に `Decal` として。未選択なら `StarterGui` に `ImageLabel` として |
| Audio | `SoundService` に `Sound` として |
| Model / Mesh | `InsertService:LoadAsset` 経由で `Workspace` へ |
| Animation | `ReplicatedStorage/rocas Animations` に `Animation` として |
| Video | `StarterGui` に `VideoFrame` として |

</details>

## 生成される出力

次のディレクトリ構造の場合:

```text
assets/images/
  ui/
    button.png
    icon.png
  fx/
    spark.png
```

<details open>
<summary><b>Luau フォーマット</b> — デフォルト。<code>stripExtensions = true</code> の例</summary>

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

使い方:

```lua
local images = require(path.to.images)

imageLabel.Image = images.ui.button
```

</details>

<details>
<summary><b>roblox-ts フォーマット</b> — <code>format = "roblox-ts"</code></summary>

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

使い方:

```typescript
import images from "shared/images";

imageLabel.Image = images.ui["button.png"];
```

</details>

## ライブラリとしての利用

```javascript
const { loadConfig, loadEnv, syncAll } = require("@plumvery/rocas");

loadEnv();
const config = loadConfig();
await syncAll(config, process.env.ROCAS_API_KEY);
```

すべてのエクスポート — sync・コード生成・ロックファイル・Studio プラグインのヘルパー — は [API リファレンス](docs/api.ja.md)に記載しています。

<details>
<summary><b>カスタムコード生成フォーマットの登録</b></summary>

<br>

コード生成フォーマットはプラグイン式です。フォーマットは `name` と、書き出すファイル群を返す `render` 関数を持つオブジェクトです:

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

返り値の各エントリは `{ extension, content }` で、グループの `output` パスの隣に書き出されます。登録すると、`rocas.toml` の各 sync グループで `format = "json"` として選択できます。

</details>

## 開発

```bash
git clone https://github.com/Plumvery/rocas.git
cd rocas
npm install
npm test
```

<details>
<summary><b>macOS: <code>npm install</code> が <code>'string.h' file not found</code> で失敗する</b></summary>

<br>

依存パッケージ `rbxm-parser` は、`node-gyp` でビルドされるネイティブモジュール `lz4` を引き込みます。Xcode がアクティブな developer directory になっている macOS では、`node-gyp` が SDK ヘッダーを解決できないことがあります:

```text
../lib/binding/lz4_binding.cc:1:10: fatal error: 'string.h' file not found
```

SDK を明示的に指定してください:

```bash
export SDKROOT="$(xcrun --show-sdk-path)"
npm install
```

シェルプロファイルにこの `export` を追加すれば恒久化できます。

</details>

<details>
<summary><b>プロジェクト構成</b></summary>

<br>

```text
bin/
  rocas.js          CLI エントリポイント
src/
  index.js          ライブラリの公開サーフェス
  config.js         .env + rocas.toml の読み込み
  sync.js           同期のオーケストレーション、拡張子 → assetType マッピング
  upload.js         Open Cloud Assets API クライアント
  asset-map.js      ロックファイルの読み込みとアセットマップ構築
  codegen.js        コード生成
  formats/          プラグイン式の出力フォーマット (luau, roblox-ts)
  studio-plugin.js  Studio プラグインとマニフェストの生成
  watch.js          ファイル監視
test/
  test.js           テストスイート (node test/test.js)
```

</details>

## コントリビュート

Issue や Pull Request を歓迎します — 開発ワークフローは [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) を参照してください。リリース履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

## ライセンス

[MIT](LICENSE) © Plumvery
