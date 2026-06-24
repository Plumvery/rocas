const fs = require("fs");
const path = require("path");
const { syncAll } = require("./sync");
const { loadConfig } = require("./config");

const DEFAULT_DEBOUNCE = 10000;
const CONFIG_FILE_NAME = "rocas.toml";

/**
 * アセットディレクトリと rocas.toml を監視して、変更時に syncAll を再実行する。
 * rocas.toml が変わった場合 (ユーザー ID 変更など) は設定を再読み込みしてから同期するため、
 * syncOne 側のフィンガープリント照合で内容据え置きのアセットも上げ直される。
 * @param {object} config - rocas.toml parse result
 * @param {string} apiKey - Roblox Open Cloud API キー
 * @param {{ debounce?: number }} opts
 */
function watchAll(config, apiKey, opts = {}) {
	const debounce = opts.debounce || DEFAULT_DEBOUNCE;
	const cwd = process.cwd();
	let activeConfig = config;
	let timer = null;
	let syncing = false;

	function scheduleSync() {
		if (syncing) return;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			syncing = true;
			try {
				console.log("[watch] 変更を検知。同期中...");
				await syncAll(activeConfig, apiKey, cwd);
				console.log("[watch] 同期完了。");
			} catch (e) {
				console.error("[watch] 同期エラー:", e.message);
			} finally {
				syncing = false;
			}
		}, debounce);
	}

	// rocas.toml を監視: 変更されたら設定を再読み込みして再同期する。
	// ファイル単体ではなく親ディレクトリを監視することで、エディタの atomic save
	// (rename での置き換え) でも監視が切れない。
	const configPath = path.join(cwd, CONFIG_FILE_NAME);
	if (fs.existsSync(configPath)) {
		fs.watch(cwd, (eventType, filename) => {
			if (filename !== CONFIG_FILE_NAME) return;
			let reloaded;
			try {
				reloaded = loadConfig(cwd);
			} catch (e) {
				console.error("[watch] rocas.toml 再読み込みエラー:", e.message);
				return;
			}
			activeConfig = reloaded;
			console.log("[watch] rocas.toml が変更されました。再読み込みして再同期します。");
			scheduleSync();
		});
	}

	const dirs = [];
	for (const syncConfig of config.sync) {
		const assetDir = path.resolve(cwd, syncConfig.path);
		if (!fs.existsSync(assetDir)) {
			console.log(`[watch] skip: ${syncConfig.path} (ディレクトリが見つかりません)`);
			continue;
		}
		fs.watch(assetDir, { recursive: true }, (eventType, filename) => {
			if (filename && (filename.endsWith(".lock.json") || filename.startsWith("."))) return;
			scheduleSync();
		});
		dirs.push(syncConfig.path);
	}

	if (dirs.length === 0) {
		console.error("[watch] 監視対象のディレクトリがありません。");
		process.exit(1);
	}

	console.log(`[watch] ${dirs.length} ディレクトリを監視中 (debounce: ${debounce}ms)`);
	for (const dir of dirs) {
		console.log(`  - ${dir}`);
	}

	process.on("SIGINT", () => {
		clearTimeout(timer);
		console.log("\n[watch] 終了");
		process.exit(0);
	});
}

module.exports = { watchAll };
