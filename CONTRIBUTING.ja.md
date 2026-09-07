# rocas へのコントリビュート

[English](CONTRIBUTING.md) | **日本語**

コントリビュートに興味を持っていただきありがとうございます！Issue や Pull Request を歓迎します。

## セットアップ

```bash
git clone https://github.com/Plumvery/rocas.git
cd rocas
npm install
npm test
```

必要なもの: Node.js 18 以上。ビルドステップはありません — パッケージは素の CommonJS JavaScript です。

> [!NOTE]
> macOS では、ネイティブモジュール `lz4` のコンパイルで `npm install` が失敗することがあります。`SDKROOT` での対処は [README の開発セクション](README.ja.md#開発)を参照してください。

## テストの実行

```bash
npm test        # node test/test.js を実行
```

テストスイートは `node:assert` を使う単一スクリプトで、テストフレームワークは使っていません。ネットワーク通信は行わず、アップロード周りの挙動は純粋な計画関数・コード生成関数のテストでカバーしています。挙動を変更する場合はテストを追加し、PR を出す前にスイートが通ることを確認してください。

[CI](.github/workflows/ci.yml) が同じスイートを Pull Request ごとに実行します。対象は Linux と Windows × Node 18（`engines` の下限）と 22 です。Windows を回しているのは飾りではなく、ロックのキーは `\` を `/` へ正規化していますし、Studio のプラグインフォルダと `rocas fetch` の出力先判定はどちらも `path.sep` を見ています。

CI はネイティブビルド込みで `npm ci` を回します。`lz4` のビルドは省略できません — 公開されているパッケージにはビルド済みの `xxhash.node` が同梱されていますが、どの runner でも読めず（Linux では `invalid ELF header`、Windows では `not a valid Win32 application`）、`rbxm-parser` はこれを無条件に require するためです。GitHub の runner にはツールチェーンが揃っています。手元で引っかかるのは macOS だけで、その場合は上の `SDKROOT` の対処を使ってください。

そのビルドが走るのは、`package.json` の `allowScripts` に `lz4` を入れてあるからです。npm 12 は依存の install スクリプトをプロジェクトが承認しない限りブロックしますが、ブロックは警告であってエラーではありません — インストール自体は成功し、`lz4` を require した時点で `ERR_DLOPEN_FAILED` として初めて表面化します。依存の更新で `lz4` のバージョンが変わったら、承認し直してください:

```bash
npm install-scripts approve lz4
```

## プロジェクト構成

```text
bin/
  rocas.js          CLI エントリポイント（引数解析のみ — ロジックは src/ 側）
src/
  index.js          ライブラリの公開サーフェス（require("@plumvery/rocas") がエクスポートするすべて）
  config.js         .env + rocas.toml の読み込み
  sync.js           同期のオーケストレーション、拡張子 → assetType マッピング
  upload.js         Open Cloud Assets API クライアント
  asset-map.js      ロックファイルの読み込みとアセットマップ構築
  codegen.js        Luau / .d.ts のレンダリング
  formats/          プラグイン式の出力フォーマット (luau, roblox-ts)
  studio-plugin.js  Studio プラグイン + マニフェスト生成（プラグインの Luau ソースはここに埋め込み）
  watch.js          ファイル監視
test/
  test.js           テストスイート
docs/
  api.md            ライブラリ API リファレンス
```

## 変更を加えるとき

- 既存のコードスタイルに合わせてください: インデントはタブ、CommonJS（`require`/`module.exports`）、ランタイム依存は `rbxm-parser` のみ。
- 公開 API や CLI を変更した場合は、[README](README.md) と [API リファレンス](docs/api.md)を更新してください — 可能なら日本語版（[README.ja.md](README.ja.md)、[docs/api.ja.md](docs/api.ja.md)）も。英語のみの更新でも構いません。その場合は PR にその旨を書いてもらえれば、翻訳は後から追従できます。
- [CHANGELOG.md](CHANGELOG.md) の `Unreleased` セクションに 1 行追加してください。

### よくあるコントリビュートのレシピ

**新しいファイル拡張子への対応** — [src/sync.js](src/sync.js) の `EXT_TO_ASSET_TYPE` と [src/upload.js](src/upload.js) の `EXT_TO_CONTENT_TYPE` に追加し、README の「対応フォーマット」表を更新します。

**コード生成フォーマットの追加** — 組み込みフォーマットは [src/formats/](src/formats/) にあり、[src/formats/index.js](src/formats/index.js) で登録されています。フォーマットは `{ name, render(lock, varName, options) }` で、`[{ extension, content }]` を返します。外部フォーマットは実行時に `registerCodegenFormat` で登録できるので、そもそも組み込みにする必要があるかも検討してください。

**Studio プラグインの挙動変更** — プラグインの Luau ソースは [src/studio-plugin.js](src/studio-plugin.js) 内の `STUDIO_PLUGIN_TEMPLATE` 文字列です。`rocas plugin` でローカルのコピーを再生成して Studio でテストしてください。

## Pull Request の出し方

1. フォークしてトピックブランチを作成。
2. テスト付きで変更を実装。
3. `npm test` を実行。
4. **何を**変えたか、**なぜ**変えたかを書いた PR を作成。関連 Issue があればリンク。

大きめの変更は、時間を使う前にアプローチを議論できるよう、先に Issue を立ててもらえると助かります。

## リリース手順

1. `CHANGELOG.md` の `[Unreleased]` 見出しを、新しいバージョンと日付に書き換える。
2. `package.json` と `package-lock.json` の `version` を上げる。1.0 前なので、破壊的変更は minor を上げる。
3. `main` へマージし、`v<version>` のタグで GitHub Release を publish する。
4. [`publish.yml`](.github/workflows/publish.yml) がそれを拾って `npm publish` を実行する。タグと `package.json` が食い違っていれば公開を拒否し、テストは `prepublishOnly` が先に走らせる。

公開は npm の **Trusted Publishing**（OIDC）経由なので、リポジトリの secrets にトークンを置きません。一度だけ必要な準備が 2 つあります。

- Trusted Publisher は、すでに npm 上に存在するパッケージにしか紐付けられません。したがって**最初の 1 回だけは手動で公開**します（`npm login` してから `npm publish`）。
- npmjs.com のパッケージ設定 **Settings → Trusted Publisher** で、このリポジトリと `publish.yml` を登録します。

npm は公開に二要素認証を要求します。アカウントで 2FA を有効にするか、**bypass 2FA** を有効にした granular access token を使ってください。後者の場合は workflow から `id-token` を外し、代わりにトークンを `NODE_AUTH_TOKEN` として渡します。
