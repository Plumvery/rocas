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
	".rbxm": "application/xml",
	".rbxmx": "application/xml",
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
	const fileName = path.basename(filePath);
	const displayName = path.basename(filePath, path.extname(filePath));
	const fileBuffer = readFileSync(filePath);
	const boundary = "----RocasBoundary" + Date.now();

	const metadata = JSON.stringify({
		assetType,
		displayName,
		description: "",
		creationContext: {
			creator:
				creator.type === "user" ? { userId: String(creator.id) } : { groupId: String(creator.id) },
		},
	});

	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="request"\r\n` +
				`Content-Type: application/json\r\n\r\n` +
				metadata +
				`\r\n--${boundary}\r\n` +
				`Content-Disposition: form-data; name="fileContent"; filename="${fileName}"\r\n` +
				`Content-Type: ${contentTypeFor(filePath)}\r\n\r\n`,
		),
		fileBuffer,
		Buffer.from(`\r\n--${boundary}--\r\n`),
	]);

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

module.exports = { contentTypeFor, uploadAsset, httpsRequest, pollOperation };
