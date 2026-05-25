const { readFileSync, existsSync } = require("fs");
const path = require("path");

/**
 * .env ファイルを読み込んで process.env にセット
 */
function loadEnv(cwd = process.cwd()) {
	const envPath = path.join(cwd, ".env");
	if (!existsSync(envPath)) return;
	for (const line of readFileSync(envPath, "utf8").split("\n")) {
		const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
		if (match) process.env[match[1]] = match[2];
	}
}

/**
 * TOML ファイルから設定を読み込む（軽量パーサー）
 */
function loadConfig(cwd = process.cwd()) {
	const configPath = path.join(cwd, "rocas.toml");
	if (!existsSync(configPath)) {
		throw new Error("rocas.toml not found");
	}
	const toml = readFileSync(configPath, "utf8");
	return parseConfig(toml);
}

/**
 * TOML をパースして設定オブジェクトを返す
 * 対応: [creator], [[sync]] 配列
 */
function parseConfig(toml) {
	const config = { creator: null, sync: [] };
	const lines = toml.split("\n");

	let currentSection = null;
	let currentItem = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		// [[sync]] — 配列セクション
		if (line === "[[sync]]") {
			if (currentItem && currentSection === "sync") {
				config.sync.push(currentItem);
			}
			currentSection = "sync";
			currentItem = {};
			continue;
		}

		// [creator] — 単体セクション
		if (line === "[creator]") {
			currentSection = "creator";
			config.creator = {};
			currentItem = config.creator;
			continue;
		}

		// [codegen] など他のセクション
		if (/^\[.+\]$/.test(line)) {
			if (currentItem && currentSection === "sync") {
				config.sync.push(currentItem);
				currentItem = null;
			}
			currentSection = line.slice(1, -1);
			continue;
		}

		// key = value
		const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
		if (kvMatch && currentItem) {
			const key = kvMatch[1];
			let value = kvMatch[2].trim();
			// コメント除去
			value = value.replace(/\s*#.*$/, "");
			// 文字列
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			// 数値
			else if (/^\d+$/.test(value)) {
				value = parseInt(value, 10);
			}
			// boolean
			else if (value === "true") value = true;
			else if (value === "false") value = false;

			currentItem[key] = value;
		}
	}

	// 最後の sync アイテムを追加
	if (currentItem && currentSection === "sync") {
		config.sync.push(currentItem);
	}

	if (!config.creator || !config.creator.id) {
		throw new Error("rocas.toml: [creator] id is required");
	}
	if (!config.creator.type) {
		config.creator.type = "user";
	}

	return config;
}

module.exports = { loadEnv, loadConfig, parseConfig };
