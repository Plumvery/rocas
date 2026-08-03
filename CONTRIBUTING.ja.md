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

## プロジェクト構成

```text
bin/
  rocas.js          CLI エントリポイント（引数解析のみ — ロジックは src/ 側）
src/
  index.js          ライブラリの公開サーフェス（require("rocas") がエクスポートするすべて）
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
