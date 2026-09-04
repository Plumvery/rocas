const { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync } = require("fs");
const { createHash } = require("crypto");
const path = require("path");
const { uploadAsset, updateAsset } = require("./upload");
const { fetchDecalImageId } = require("./image-id");
const { resolveCodegenFormat } = require("./formats");

/**
 * Image ID の解決対象となる assetType。
 * Open Cloud が返すのは Decal ID なので、`ImageLabel.Image` 等が使える Image ID を別途引く。
 */
const IMAGE_ID_ASSET_TYPES = new Set(["Decal"]);

/**
 * 連続で何回解決に失敗したらそのグループの残りを諦めるか。
 * 画像が非公開・審査中などで systematic に失敗する場合、全ファイルでリトライすると
 * sync がいつまでも終わらないため。
 */
const IMAGE_ID_FAILURE_LIMIT = 3;

/**
 * 内容の差し替え (Update Asset) に対応する assetType。
 * Assets API の Update Asset は "Currently can only update the content body for Models" とされ、
 * Audio・Decal/Image・Mesh・Video は "Not available for updating" と明記されている。Animation は
 * どちらにも挙がっていないので、Model だけを対象にする。バイナリの .rbxm を含む Model の内容更新は
 * 2026-09-04 に実 API で確認済み (ガイド側の ".fbx のみ更新できる" という記述は実挙動と合わない)。
 * 対象外の型は従来どおり新規アップロードになり、assetId が変わる。
 * https://create.roblox.com/docs/cloud/guides/usage-assets
 */
const UPDATABLE_ASSET_TYPES = new Set(["Model"]);

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
 * アップロード結果に影響する設定のフィンガープリント。
 * creator (誰の所有としてアップロードするか) と assetType (アップロード時のタイプ) が
 * 変わると、ファイル内容が同じでも別アセットとして上げ直す必要がある。これをロック
 * エントリへ保存しておき、次回 sync 時に rocas.toml の変更 (ユーザー ID 変更など) を検知する。
 */
function configFingerprint(creator, assetType) {
	const payload = JSON.stringify({
		creatorType: creator.type,
		creatorId: String(creator.id),
		assetType: assetType,
	});
	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * 既存ロックエントリ・現在のファイル内容・現在の設定から、取るべきアクションを決める。
 * @param {object | undefined} cached - lock[key]
 * @param {string} hash - 現在のファイル内容ハッシュ
 * @param {string} fingerprint - 現在の設定フィンガープリント
 * @param {string} [assetType] - 現在の assetType。省略すると内容更新は選ばれず upload になる
 * @returns {"upload" | "update" | "reuse" | "rebaseline"}
 *   upload     - 新規 / 設定 (creator・assetType) が変わった / 内容は変わったが更新できない → 新規アップロード
 *   update     - 内容だけが変わり、その assetType が内容更新に対応する → 同じ assetId で上げ直し
 *   reuse      - 内容も設定も一致 → スキップ
 *   rebaseline - 内容は一致するが設定未記録の旧ロック → 再アップロードせず設定だけ記録
 */
function planSyncAction(cached, hash, fingerprint, assetType) {
	if (!cached) {
		return "upload";
	}
	if (cached.hash !== hash) {
		// 設定が一致していれば同じアセットの中身が差し替わっただけなので、assetId を保てる。
		// creator・assetType が変わっている場合は別アセットとして上げ直すしかない。
		const hasAssetId = cached.assetId != null && String(cached.assetId) !== "";
		const canUpdate = cached.config === fingerprint && hasAssetId && UPDATABLE_ASSET_TYPES.has(assetType);
		return canUpdate ? "update" : "upload";
	}
	if (cached.config === fingerprint) {
		return "reuse";
	}
	if (cached.config === undefined) {
		return "rebaseline";
	}
	return "upload";
}

/**
 * このロックエントリが Image ID の解決を必要とするか。
 * 画像 (Decal) で、アップロード済みで、まだ imageId を持っていないものだけが対象。
 * 旧ロック (imageId 無し) は再アップロードせずに補完できる。
 * @param {object | undefined} entry - lock[key]
 * @param {string} assetType
 */
function needsImageId(entry, assetType) {
	if (!IMAGE_ID_ASSET_TYPES.has(assetType)) return false;
	if (!entry || entry.assetId == null) return false;
	return entry.imageId == null || String(entry.imageId) === "";
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
 * @param {object} syncConfig - { name, path, output, assetType?, resolveImageIds? }
 * @param {{ type: string, id: number }} creator
 * @param {string} apiKey
 * @param {string} cwd
 * @param {{ resolveImageId?: (decalId: string, apiKey: string) => Promise<string> }} [options] - Image ID 解決の差し替え (テスト用)
 */
async function syncOne(syncConfig, creator, apiKey, cwd, options = {}) {
	const assetDir = path.resolve(cwd, syncConfig.path);
	if (!existsSync(assetDir)) {
		console.log(`[${syncConfig.name}] skip: directory not found (${syncConfig.path})`);
		return;
	}

	const lockPath = path.join(assetDir, `${syncConfig.name}.lock.json`);
	const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};

	const files = walkDir(assetDir);
	let changed = false;

	const resolveImageId = options.resolveImageId || ((decalId, key) => fetchDecalImageId(decalId, { apiKey: key }));
	const imageIdsEnabled = syncConfig.resolveImageIds !== false;
	let imageIdFailures = 0;

	/**
	 * Decal エントリに中身の Image ID を補完する。
	 * 解決できなくても sync 自体は失敗させず、Decal ID のまま次回の sync に持ち越す。
	 * @returns {Promise<boolean>} エントリを書き換えたか (= ロックの保存が必要か)
	 */
	async function attachImageId(entry, assetType, relPath) {
		if (!imageIdsEnabled) return false;
		if (!needsImageId(entry, assetType)) return false;
		if (imageIdFailures >= IMAGE_ID_FAILURE_LIMIT) return false;

		try {
			const imageId = await resolveImageId(entry.assetId, apiKey);
			entry.imageId = String(imageId);
			imageIdFailures = 0;
			console.log(`[${syncConfig.name}] image id: ${relPath} → rbxassetid://${entry.imageId}`);
			return true;
		} catch (error) {
			imageIdFailures++;
			console.warn(
				`[${syncConfig.name}] warning: could not resolve the image id of ${relPath} (${error.message}); keeping the decal id`,
			);
			if (imageIdFailures >= IMAGE_ID_FAILURE_LIMIT) {
				console.warn(
					`[${syncConfig.name}] warning: image id resolution failed ${IMAGE_ID_FAILURE_LIMIT} times in a row; skipping it for the rest of this group`,
				);
			}
			return false;
		}
	}

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
		const fingerprint = configFingerprint(creator, assetType);
		const cached = lock[key];
		const action = planSyncAction(cached, hash, fingerprint, assetType);

		if (action === "reuse") {
			console.log(`[${syncConfig.name}] skip: ${relPath} (unchanged)`);
			// 上げ直しは不要でも、Image ID 未解決の画像 (旧ロック・前回失敗) はここで補完する
			if (await attachImageId(cached, assetType, relPath)) {
				lock[key] = cached;
				changed = true;
			}
			continue;
		}

		// 旧フォーマットのロック (設定未記録): 内容は一致しているので上げ直さず、現在の
		// 設定だけ記録して、次回以降の rocas.toml 変更を検知できるようにする。
		if (action === "rebaseline") {
			console.log(`[${syncConfig.name}] skip: ${relPath} (unchanged; recording config baseline)`);
			const entry = { ...cached, config: fingerprint };
			await attachImageId(entry, assetType, relPath);
			lock[key] = entry;
			changed = true;
			continue;
		}

		// 内容だけが変わったので、新しい ID を振らずに既存アセットへ新しいバージョンを上げる。
		// 参照側 (生成コード・Studio マニフェスト) の ID が据え置きになる。
		if (action === "update") {
			console.log(`[${syncConfig.name}] updating: ${relPath} (content changed) ...`);
			await updateAsset(cached.assetId, filePath, assetType, apiKey, creator);
			console.log(`[${syncConfig.name}] done: ${relPath} → rbxassetid://${cached.assetId}`);
			const entry = { ...cached, hash, config: fingerprint };
			await attachImageId(entry, assetType, relPath);
			lock[key] = entry;
			changed = true;
			continue;
		}

		let reason;
		if (!cached) {
			reason = "new";
		} else if (cached.hash !== hash) {
			reason = "content changed";
		} else {
			reason = "config changed";
		}
		console.log(`[${syncConfig.name}] uploading: ${relPath} (${reason}) ...`);
		const assetId = await uploadAsset(filePath, assetType, apiKey, creator);
		console.log(`[${syncConfig.name}] done: ${relPath} → rbxassetid://${assetId}`);
		// 新規エントリなので、assetType が Decal から変わった場合も古い imageId は引き継がない
		const entry = { assetId: String(assetId), hash, config: fingerprint };
		await attachImageId(entry, assetType, relPath);
		lock[key] = entry;
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
async function syncAll(config, apiKey, cwd = process.cwd(), options = {}) {
	for (const syncConfig of config.sync) {
		await syncOne(syncConfig, config.creator, apiKey, cwd, options);
	}
}

module.exports = {
	syncAll,
	syncOne,
	walkDir,
	fileHash,
	configFingerprint,
	planSyncAction,
	needsImageId,
	EXT_TO_ASSET_TYPE,
};
