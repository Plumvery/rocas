const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");
const { fetchAssetContent } = require("./image-id");
const { loadLockForSync, resolveEntryAssetId } = require("./asset-map");

/**
 * lock に載っているアセットを Open Cloud から手元へ落とす。`sync` の逆向き。
 *
 * 出力先は既定で sync グループの `path` の**外**。復元したファイルは元ファイルと
 * バイト一致しないので、`path` の中へ戻すと次の `rocas sync` が「中身が変わった」と
 * 判定してしまう。Model は in-place 更新で済むが、Decal / Audio / Video は新規
 * アップロードになり assetId が変わって参照が全部壊れる。
 */
const DEFAULT_FETCH_DIR = ".rocas-cache";

/** 何をどこへ落としたかの記録。lock と同じく 1 グループ 1 ファイル。 */
const FETCH_INDEX_SUFFIX = ".fetch.json";

/**
 * 連続で何回取得に失敗したらそのグループの残りを諦めるか。
 * API キーの権限不足など systematic に失敗する場合、全ファイルでリトライすると
 * fetch がいつまでも終わらないため (sync の Image ID 解決と同じ考え方)。
 */
const FETCH_FAILURE_LIMIT = 3;

/**
 * 本体の先頭バイト → 拡張子。
 *
 * 返ってくるのは「上げたファイル」ではなく「Roblox が保持している形」なので、lock の
 * キー (元ファイル名) の拡張子はあてにならない。.fbx を上げれば MeshPart 化済みの
 * .rbxm が返るし、音声も上げた形式のままとは限らない。
 * `.rbxm` は `.rbxmx` の前に置く ("<roblox!" は "<roblox" で始まるため)。
 */
const CONTENT_SIGNATURES = [
	{ ext: ".rbxm", magic: "<roblox!" },
	{ ext: ".rbxmx", magic: "<roblox" },
	{ ext: ".png", magic: "\x89PNG" },
	{ ext: ".jpg", magic: "\xff\xd8\xff" },
	{ ext: ".gif", magic: "GIF8" },
	{ ext: ".bmp", magic: "BM" },
	{ ext: ".ogg", magic: "OggS" },
	{ ext: ".flac", magic: "fLaC" },
	{ ext: ".mp3", magic: "ID3" },
	{ ext: ".wav", magic: "RIFF" },
	{ ext: ".mp4", magic: "ftyp", offset: 4 },
];

/**
 * 本体の中身から拡張子を決める。判別できなければ元の拡張子に落とす。
 * @param {Buffer} body
 * @param {string} [fallbackExt] - lock のキーから取った拡張子 (".png" など)
 * @returns {string} "." 始まりの拡張子
 */
function detectContentExtension(body, fallbackExt = "") {
	if (Buffer.isBuffer(body)) {
		for (const { ext, magic, offset = 0 } of CONTENT_SIGNATURES) {
			const bytes = Buffer.from(magic, "latin1");
			const end = offset + bytes.length;
			if (body.length >= end && body.compare(bytes, 0, bytes.length, offset, end) === 0) {
				return ext;
			}
		}
	}
	return fallbackExt || ".bin";
}

/**
 * fetch の出力先を解決する。
 */
function resolveFetchDir(cwd = process.cwd(), outDir) {
	return path.resolve(cwd, outDir || DEFAULT_FETCH_DIR);
}

/**
 * グループの取得記録ファイルのパス。
 */
function fetchIndexPath(outDir, syncConfig) {
	return path.join(outDir, `${syncConfig.name}${FETCH_INDEX_SUFFIX}`);
}

function loadFetchIndex(outDir, syncConfig) {
	const indexPath = fetchIndexPath(outDir, syncConfig);
	if (!existsSync(indexPath)) return {};
	try {
		return JSON.parse(readFileSync(indexPath, "utf8"));
	} catch {
		// 壊れていたら作り直す。最悪もう一度落とすだけで済む。
		return {};
	}
}

/**
 * すでに手元にあるものを取り直さないための判定。
 * lock の assetId / hash が記録と一致し、落としたファイルが残っていれば取得不要。
 * @param {object | undefined} cached - index[lockKey]
 * @param {string} assetId - lock から解決した現在のアセット ID
 * @param {string | undefined} hash - lock エントリの hash
 * @param {boolean} fileExists
 * @returns {"fetch" | "reuse"}
 */
function planFetchAction(cached, assetId, hash, fileExists) {
	if (!cached) return "fetch";
	if (cached.assetId !== assetId) return "fetch";
	if (cached.hash !== hash) return "fetch";
	if (!fileExists) return "fetch";
	return "reuse";
}

/**
 * 出力先を `path` の中に含んでしまう sync グループ名を返す。
 */
function syncPathsContaining(config, cwd, outDir) {
	const hits = [];
	for (const syncConfig of config.sync || []) {
		const assetDir = path.resolve(cwd, syncConfig.path);
		if (outDir === assetDir || outDir.startsWith(assetDir + path.sep)) {
			hits.push(syncConfig.name);
		}
	}
	return hits;
}

/**
 * sync グループ 1 つ分を取得する。
 * @returns {Promise<{ fetched: number, reused: number, failed: number }>}
 */
async function fetchGroup(syncConfig, apiKey, cwd, outDir, options = {}) {
	const fetchContent = options.fetchContent || ((assetId, key) => fetchAssetContent(assetId, { apiKey: key }));
	const stats = { fetched: 0, reused: 0, failed: 0 };

	const lock = loadLockForSync(syncConfig, cwd);
	const entries = Object.entries(lock);
	if (entries.length === 0) {
		console.log(`[${syncConfig.name}] skip: no lock entries (run rocas sync first)`);
		return stats;
	}

	const index = loadFetchIndex(outDir, syncConfig);
	let changed = false;
	let failures = 0;

	for (const [lockKey, entry] of entries) {
		// 画像は imageId (中身) を優先する。Decal ID を落とすと画像ではなく
		// 画像を指すだけの Decal が返ってくる。
		const assetId = resolveEntryAssetId(entry);
		if (!assetId) {
			console.log(`[${syncConfig.name}] skip: ${lockKey} (no asset id in the lock)`);
			continue;
		}

		const cached = index[lockKey];
		const cachedPath = cached && cached.file ? path.join(outDir, cached.file) : null;
		const action = planFetchAction(cached, assetId, entry.hash, cachedPath != null && existsSync(cachedPath));

		if (action === "reuse") {
			console.log(`[${syncConfig.name}] skip: ${lockKey} (already fetched)`);
			stats.reused++;
			continue;
		}

		if (failures >= FETCH_FAILURE_LIMIT) {
			stats.failed++;
			continue;
		}

		try {
			const body = await fetchContent(assetId, apiKey);
			const file = `${assetId}${detectContentExtension(body, path.extname(lockKey).toLowerCase())}`;
			writeFileSync(path.join(outDir, file), body);
			index[lockKey] = { assetId, hash: entry.hash, file };
			changed = true;
			failures = 0;
			stats.fetched++;
			console.log(`[${syncConfig.name}] fetched: ${lockKey} → ${file} (${body.length} bytes)`);
		} catch (error) {
			failures++;
			stats.failed++;
			console.warn(`[${syncConfig.name}] warning: could not fetch ${lockKey} (${error.message})`);
			if (failures >= FETCH_FAILURE_LIMIT) {
				console.warn(
					`[${syncConfig.name}] warning: fetch failed ${FETCH_FAILURE_LIMIT} times in a row; skipping the rest of this group`,
				);
			}
		}
	}

	if (changed) {
		writeFileSync(fetchIndexPath(outDir, syncConfig), JSON.stringify(index, null, 2) + "\n");
	}

	return stats;
}

/**
 * lock に載っているアセットを手元へ落とす。
 *
 * ファイル名は `<assetId>.<ext>` で、拡張子は本体の中身から決める。何をどこへ
 * 落としたかは `<group>.fetch.json` に記録し、lock の assetId / hash が変わって
 * いなければ取り直さない。
 * @param {object} config - loadConfig() の戻り値
 * @param {string} apiKey - Open Cloud API キー (Assets の read 権限)
 * @param {string} [cwd]
 * @param {{ out?: string, groups?: string[], fetchContent?: (assetId: string, apiKey: string) => Promise<Buffer> }} [options]
 * @returns {Promise<{ outDir: string, fetched: number, reused: number, failed: number }>}
 */
async function fetchAll(config, apiKey, cwd = process.cwd(), options = {}) {
	const groups = options.groups && options.groups.length > 0 ? options.groups : null;
	if (groups) {
		const known = new Set((config.sync || []).map((syncConfig) => syncConfig.name));
		const unknown = groups.filter((name) => !known.has(name));
		if (unknown.length > 0) {
			throw new Error(`Unknown sync group(s): ${unknown.join(", ")}`);
		}
	}

	const outDir = resolveFetchDir(cwd, options.out);
	const collisions = syncPathsContaining(config, cwd, outDir);
	if (collisions.length > 0) {
		console.warn(
			`warning: the output directory is inside the synced path of ${collisions.join(", ")}. ` +
				"Fetched files do not match the originals byte for byte, so the next rocas sync sees them as changed — " +
				"for anything but Model that means a new upload and a new asset id.",
		);
	}

	if (!existsSync(outDir)) {
		mkdirSync(outDir, { recursive: true });
	}

	const total = { outDir, fetched: 0, reused: 0, failed: 0 };
	for (const syncConfig of config.sync || []) {
		if (groups && !groups.includes(syncConfig.name)) continue;
		const stats = await fetchGroup(syncConfig, apiKey, cwd, outDir, options);
		total.fetched += stats.fetched;
		total.reused += stats.reused;
		total.failed += stats.failed;
	}

	return total;
}

module.exports = {
	fetchAll,
	fetchGroup,
	detectContentExtension,
	planFetchAction,
	fetchIndexPath,
	resolveFetchDir,
	DEFAULT_FETCH_DIR,
};
