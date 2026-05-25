const { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync } = require("fs");
const { createHash } = require("crypto");
const path = require("path");
const { uploadAsset } = require("./upload");
const { resolveCodegenFormat } = require("./formats");

/**
 * 拡張子 → Roblox assetType マッピング
 */
const EXT_TO_ASSET_TYPE = {
	// 画像
	".png": "Decal",
	".jpg": "Decal",
	".jpeg": "Decal",
	".bmp": "Decal",
	".tga": "Decal",
	// 音声
	".mp3": "Audio",
	".ogg": "Audio",
	".wav": "Audio",
	".flac": "Audio",
	// 3Dモデル / メッシュ
	".fbx": "Model",
	".glb": "Model",
	".gltf": "Model",
	".obj": "Model",
	// アニメーション
	".rbxm": "Animation",
	".rbxmx": "Animation",
	// 動画
	".mp4": "Video",
	".mov": "Video",
};

/**
 * ファイルの SHA256 ハッシュを計算
 */
function fileHash(filePath) {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * ディレクトリを再帰走査してファイル一覧を返す
 * @returns {{ filePath: string, relPath: string }[]}
 */
function walkDir(dir, base = dir) {
	const results = [];
	if (!existsSync(dir)) return results;
	for (const entry of readdirSync(dir)) {
		if (entry.startsWith(".") || entry.endsWith(".lock.json")) continue;
		const fullPath = path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			results.push(...walkDir(fullPath, base));
		} else {
			results.push({
				filePath: fullPath,
				relPath: path.relative(base, fullPath),
			});
		}
	}
	return results;
}

/**
 * sync セクション 1 つを処理
 * @param {object} syncConfig - { name, path, output, assetType? }
 * @param {{ type: string, id: number }} creator
 * @param {string} apiKey
 * @param {string} cwd
 */
async function syncOne(syncConfig, creator, apiKey, cwd) {
	const assetDir = path.resolve(cwd, syncConfig.path);
	if (!existsSync(assetDir)) {
		console.log(`[${syncConfig.name}] skip: directory not found (${syncConfig.path})`);
		return;
	}

	const lockPath = path.join(assetDir, `${syncConfig.name}.lock.json`);
	const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};

	const files = walkDir(assetDir);
	let changed = false;

	for (const { filePath, relPath } of files) {
		const ext = path.extname(filePath).toLowerCase();

		// assetType: 設定で明示指定されていれば優先、なければ拡張子から自動判定
		const assetType = syncConfig.assetType || EXT_TO_ASSET_TYPE[ext];
		if (!assetType) {
			console.log(`[${syncConfig.name}] skip: unsupported extension (${relPath})`);
			continue;
		}

		const key = relPath.replace(/\\/g, "/");
		const hash = fileHash(filePath);

		if (lock[key]?.hash === hash) {
			console.log(`[${syncConfig.name}] skip: ${relPath} (unchanged)`);
			continue;
		}

		console.log(`[${syncConfig.name}] uploading: ${relPath} ...`);
		const assetId = await uploadAsset(filePath, assetType, apiKey, creator);
		console.log(`[${syncConfig.name}] done: ${relPath} → rbxassetid://${assetId}`);
		lock[key] = { assetId: String(assetId), hash };
		changed = true;
	}

	if (changed || !existsSync(lockPath)) {
		writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
	}

	// Code generation is handled by format modules. Luau is the default,
	// roblox-ts is an opt-in compatibility format.
	if (syncConfig.output && Object.keys(lock).length > 0) {
		const format = resolveCodegenFormat(syncConfig.format);
		const stripExtensions = syncConfig.stripExtensions || false;
		const outputPath = path.resolve(cwd, syncConfig.output);
		const outputDir = path.dirname(outputPath);
		if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

		// output から拡張子を除去してベースパスを得る
		const basePath = outputPath.replace(/\.(d\.ts|ts|luau)$/, "");
		const varName = syncConfig.name.replace(/[^a-zA-Z0-9]/g, "_");
		const outputs = format.render(lock, varName, { stripExtensions });
		const outputFiles = outputs.map((output) => ({
			path: basePath + output.extension,
			content: output.content,
		}));
		let generated = false;

		for (const outputFile of outputFiles) {
			const existingContent = existsSync(outputFile.path) ? readFileSync(outputFile.path, "utf8") : "";
			if (outputFile.content !== existingContent) {
				writeFileSync(outputFile.path, outputFile.content);
				generated = true;
			}
		}

		if (generated) {
			const generatedPaths = outputFiles.map((outputFile) => path.relative(cwd, outputFile.path)).join(" + ");
			console.log(`[${syncConfig.name}] generated: ${generatedPaths}`);
		}
	}
}

/**
 * 全 sync セクションを順次処理
 */
async function syncAll(config, apiKey, cwd = process.cwd()) {
	for (const syncConfig of config.sync) {
		await syncOne(syncConfig, config.creator, apiKey, cwd);
	}
}

module.exports = { syncAll, syncOne, walkDir, fileHash, EXT_TO_ASSET_TYPE };
