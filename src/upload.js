const https = require("https");
const { readFileSync } = require("fs");
const path = require("path");

const EXT_TO_CONTENT_TYPE = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".bmp": "image/bmp",
	".tga": "image/tga",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".wav": "audio/wav",
	".flac": "audio/flac",
	".fbx": "model/fbx",
	".glb": "model/gltf-binary",
	".gltf": "model/gltf+json",
	".obj": "model/obj",
	".rbxm": "model/x-rbxm",
	".rbxmx": "model/x-rbxm",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
};

function contentTypeFor(filePath) {
	return EXT_TO_CONTENT_TYPE[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * HTTPS リクエスト（Promise ラッパー）
 */
function httpsRequest(options, body) {
	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				try {
					resolve({ status: res.statusCode, body: JSON.parse(data) });
				} catch {
					resolve({ status: res.statusCode, body: data });
				}
			});
		});
		req.on("error", reject);
		if (body) req.write(body);
		req.end();
	});
}

/**
 * creationContext.creator の中身。user と group で送るキーが違う。
 */
function creatorContext(creator) {
	return creator.type === "user" ? { userId: String(creator.id) } : { groupId: String(creator.id) };
}

/**
 * multipart/form-data のボディを組み立てる。
 * Assets API は新規作成 (POST) も更新 (PATCH) も `request` (JSON) と `fileContent`
 * (バイナリ) の 2 パートを要求するので、両方で同じ組み立てを使う。
 */
function buildMultipartBody(boundary, metadata, filePath) {
	const fileName = path.basename(filePath);
	return Buffer.concat([
		Buffer.from(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="request"\r\n` +
				`Content-Type: application/json\r\n\r\n` +
				metadata +
				`\r\n--${boundary}\r\n` +
				`Content-Disposition: form-data; name="fileContent"; filename="${fileName}"\r\n` +
				`Content-Type: ${contentTypeFor(filePath)}\r\n\r\n`,
		),
		readFileSync(filePath),
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);
}

/**
 * オペレーション完了までポーリング
 */
async function pollOperation(operationPath, apiKey) {
	while (true) {
		await new Promise((r) => setTimeout(r, 2000));
		const res = await httpsRequest(
			{
				hostname: "apis.roblox.com",
				path: `/assets/v1/${operationPath}`,
				method: "GET",
				headers: { "x-api-key": apiKey },
			},
			null,
		);
		if (res.body.done) return res.body;
		if (res.body.error) throw new Error(`Operation failed: ${JSON.stringify(res.body.error)}`);
	}
}

/**
 * Open Cloud API でアセットをアップロード
 * @param {string} filePath - アップロードするファイルパス
 * @param {string} assetType - Roblox アセットタイプ (Decal, Audio, Model, Animation, Video)
 * @param {string} apiKey - Open Cloud API キー
 * @param {{ type: string, id: number }} creator - クリエイター情報
 * @returns {Promise<string>} assetId
 */
async function uploadAsset(filePath, assetType, apiKey, creator) {
	const displayName = path.basename(filePath, path.extname(filePath));
	const boundary = "----RocasBoundary" + Date.now();

	const metadata = JSON.stringify({
		assetType,
		displayName,
		description: "",
		creationContext: { creator: creatorContext(creator) },
	});

	const body = buildMultipartBody(boundary, metadata, filePath);

	const res = await httpsRequest(
		{
			hostname: "apis.roblox.com",
			path: "/assets/v1/assets",
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
				"Content-Length": body.length,
			},
		},
		body,
	);

	if (res.status !== 200) {
		throw new Error(`Upload failed (${res.status}): ${JSON.stringify(res.body)}`);
	}

	const result = await pollOperation(res.body.path, apiKey);
	if (result.error) {
		throw new Error(`Operation failed: ${JSON.stringify(result.error)}`);
	}

	return result.response.assetId;
}

/**
 * Open Cloud API で既存アセットの内容を差し替える。assetId は変わらず、新しいバージョンが増える。
 *
 * 内容の更新に対応する assetType は限られる (2026-09 時点では Model のみ)。呼び出し側で
 * 絞ること。対応しない型に投げると 400 が返る。
 * @param {string} assetId - 更新対象の assetId
 * @param {string} filePath - アップロードするファイルパス
 * @param {string} assetType - Roblox アセットタイプ
 * @param {string} apiKey - Open Cloud API キー
 * @param {{ type: string, id: number }} creator - クリエイター情報
 * @returns {Promise<string>} assetId (引数と同じ値)
 */
async function updateAsset(assetId, filePath, assetType, apiKey, creator) {
	const boundary = "----RocasBoundary" + Date.now();

	// updateMask を付けないので内容だけが更新される。displayName / description は
	// updateMask に載せない限り反映されないので、ここでは送らない。
	const metadata = JSON.stringify({
		assetType,
		assetId: String(assetId),
		creationContext: { creator: creatorContext(creator) },
	});

	const body = buildMultipartBody(boundary, metadata, filePath);

	const res = await httpsRequest(
		{
			hostname: "apis.roblox.com",
			path: `/assets/v1/assets/${assetId}`,
			method: "PATCH",
			headers: {
				"x-api-key": apiKey,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
				"Content-Length": body.length,
			},
		},
		body,
	);

	if (res.status !== 200) {
		throw new Error(`Update failed (${res.status}): ${JSON.stringify(res.body)}`);
	}

	// 内容の更新は Operation を返すが、メタデータだけの更新は更新後のフィールドを直接返す
	// 仕様になっている。path が無い応答をポーリングすると URL が壊れて無限ループするので、
	// その場合は完了として扱う。
	if (!res.body || !res.body.path) {
		return String(assetId);
	}

	const result = await pollOperation(res.body.path, apiKey);
	if (result.error) {
		throw new Error(`Operation failed: ${JSON.stringify(result.error)}`);
	}

	return String(assetId);
}

module.exports = { contentTypeFor, uploadAsset, updateAsset, httpsRequest, pollOperation };
