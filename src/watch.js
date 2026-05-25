const fs = require("fs");
const path = require("path");
const { syncAll } = require("./sync");

const DEFAULT_DEBOUNCE = 10000;

/**
 * アセットディレクトリを監視して変更時に syncAll を再実行する
 * @param {object} config - rocas.toml parse result
 * @param {string} apiKey - Roblox Open Cloud API キー
 * @param {{ debounce?: number }} opts
 */
function watchAll(config, apiKey, opts = {}) {
	const debounce = opts.debounce || DEFAULT_DEBOUNCE;
	const cwd = process.cwd();
	let timer = null;
	let syncing = false;

	function scheduleSync() {
		if (syncing) return;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			syncing = true;
			try {
				console.log("[watch] 変更を検知。同期中...");
				await syncAll(config, apiKey, cwd);
				console.log("[watch] 同期完了。");
			} catch (e) {
				console.error("[watch] 同期エラー:", e.message);
			} finally {
				syncing = false;
			}
		}, debounce);
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
