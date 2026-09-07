const https = require("https");
const zlib = require("zlib");

/**
 * アセット本体の取得と、Decal → Image ID 解決。
 *
 * Open Cloud に .png を上げると返ってくるのは **Decal** のアセット ID で、
 * 中身の Image アセット ID とは別物。`Decal.Texture` は Decal ID でも動くが、
 * `ImageLabel.Image` / `ImageButton.Image` / `ParticleEmitter.Texture` などは
 * Image ID を要求するため、Decal 本体を 1 回ダウンロードして中身の ID を取り出す。
 *
 * 取得経路 (上から順に試す):
 *   1. Open Cloud の asset-delivery-api (x-api-key 認証) — 現行の推奨経路。
 *   2. 旧 assetdelivery (認証なし) — 2025-04-02 以降ほとんどの資産で 401 になるが、
 *      古い公開アセットは通るので API キーが無い呼び出し向けのフォールバックとして残す。
 *
 * どちらも「CDN の場所を JSON で返す → 本体を取り直す」の 2 ホップ。
 * CDN の本体は gzip で返ってくるため展開が必要。
 *
 * この経路は Image ID 解決に限った話ではないので、本体をそのまま返す
 * `fetchAssetContent` も同じ土台の上に載せてある。
 */

const OPEN_CLOUD_ASSET_DELIVERY = "https://apis.roblox.com/asset-delivery-api/v1/assetId";
const LEGACY_ASSET_DELIVERY = "https://assetdelivery.roblox.com/v1/assetId";
const USER_AGENT = "rocas (+https://github.com/Plumvery/rocas)";
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;
const MAX_REDIRECTS = 5;

// XML 形式 (.rbxmx) の Decal — Texture プロパティを名指しで拾う
const TEXTURE_URL_PATTERN = /<Content\s+name="Texture">\s*<url>([^<]*)<\/url>/i;
// URL 中のアセット ID。バイナリ .rbxm でも URL 文字列はそのまま埋まっているので拾える
const ASSET_ID_PATTERN = /(?:rbxassetid:\/\/|[?&]id=)(\d+)/i;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * gzip なら展開する。CDN は encoding=gzip で本体を返してくるが、
 * Node の https は自動展開しないので自前でマジックバイトを見る。
 */
function decompress(buffer) {
	if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
		return zlib.gunzipSync(buffer);
	}
	return buffer;
}

/**
 * リダイレクトを辿る HTTPS GET。本文を Buffer で返す。
 */
function httpsGetBuffer(url, headers = {}, redirectsLeft = MAX_REDIRECTS) {
	return new Promise((resolve, reject) => {
		const requestHeaders = { "User-Agent": USER_AGENT, Accept: "*/*", ...headers };
		const req = https.get(url, { headers: requestHeaders }, (res) => {
			const status = res.statusCode;
			const location = res.headers.location;

			if (status >= 300 && status < 400 && location) {
				res.resume();
				if (redirectsLeft <= 0) {
					reject(new Error(`too many redirects for ${url}`));
					return;
				}
				resolve(httpsGetBuffer(new URL(location, url).toString(), headers, redirectsLeft - 1));
				return;
			}

			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
			res.on("error", reject);
		});
		req.on("error", reject);
	});
}

/**
 * アセット配信からの取得。非 200 は投げる。gzip は展開して返す。
 */
async function fetchAssetBody(url, headers = {}) {
	const { status, body } = await httpsGetBuffer(url, headers);
	if (status !== 200) {
		// 401/403 はたいてい API キーの権限不足 (Assets の Read が要る)
		throw new Error(`GET ${url} failed (${status})`);
	}
	return decompress(body);
}

/**
 * Decal アセットの本体から Image ID を取り出す。
 * XML / バイナリどちらでも動くよう、latin1 で文字列化してから URL を拾う。
 * @param {Buffer | string} body
 * @returns {string | null} 数値文字列の Image ID。見つからなければ null
 */
function extractImageIdFromAssetBody(body) {
	if (body == null) return null;

	const text = Buffer.isBuffer(body) ? body.toString("latin1") : String(body);

	const textureMatch = text.match(TEXTURE_URL_PATTERN);
	if (textureMatch) {
		const idMatch = textureMatch[1].match(ASSET_ID_PATTERN);
		if (idMatch) return idMatch[1];
	}

	const fallbackMatch = text.match(ASSET_ID_PATTERN);
	return fallbackMatch ? fallbackMatch[1] : null;
}

/**
 * アセット配信の JSON から CDN の場所を取り出す。
 * 単数 (`{ location }`) と複数 (`{ locations: [{ location }] }`) の両形式に対応。
 */
function parseAssetLocation(body) {
	const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!parsed) return null;

	if (typeof parsed.location === "string" && parsed.location) {
		return parsed.location;
	}
	if (Array.isArray(parsed.locations)) {
		for (const entry of parsed.locations) {
			if (entry && typeof entry.location === "string" && entry.location) {
				return entry.location;
			}
		}
	}
	return null;
}

/**
 * 試す順にアセット配信のエンドポイントを並べる。
 * @param {string} assetId
 * @param {string | null} apiKey
 * @param {string | number | null} [version] - 版を固定したいとき。`.../assetId/{id}/version/{n}`
 */
function assetDeliveryEndpoints(assetId, apiKey, version = null) {
	const suffix = version == null || version === "" ? "" : `/version/${version}`;
	const endpoints = [];
	if (apiKey) {
		endpoints.push({ url: `${OPEN_CLOUD_ASSET_DELIVERY}/${assetId}${suffix}`, headers: { "x-api-key": apiKey } });
	}
	endpoints.push({ url: `${LEGACY_ASSET_DELIVERY}/${assetId}${suffix}`, headers: {} });
	return endpoints;
}

/**
 * "rbxassetid://" 前置きを外して数値文字列にする。
 * @param {string | number} assetId
 * @param {string} kind - エラー文言に出す呼び名 ("asset" / "decal asset")
 */
function normalizeAssetId(assetId, kind) {
	const id = String(assetId).replace(/^rbxassetid:\/\//, "").trim();
	if (!/^\d+$/.test(id)) {
		throw new Error(`invalid ${kind} id: ${assetId}`);
	}
	return id;
}

/**
 * アセット配信を「エンドポイントのフォールバック × リトライ」で回す共通部分。
 *
 * アップロード直後は本体がまだ配信されず失敗しうるので数回リトライする。`accept` が
 * 非 null を返した時点で成功。全部外したら最後のエラーを添えて null を返す。
 * @param {string} id - 正規化済みのアセット ID
 * @param {object} options
 * @param {(body: Buffer | string) => any} accept - 本体を受け取り、欲しい値か null を返す
 * @returns {Promise<{ value: any, lastError: Error | null }>}
 */
async function deliverAsset(id, options, accept) {
	const {
		apiKey = null,
		version = null,
		attempts = DEFAULT_ATTEMPTS,
		retryDelayMs = DEFAULT_RETRY_DELAY_MS,
		fetchAsset = fetchAssetBody,
		wait = sleep,
	} = options;

	let lastError = null;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		for (const { url, headers } of assetDeliveryEndpoints(id, apiKey, version)) {
			try {
				const location = parseAssetLocation(await fetchAsset(url, headers));
				if (!location) continue;

				const value = accept(await fetchAsset(location, {}));
				if (value != null) return { value, lastError };
			} catch (error) {
				lastError = error;
			}
		}
		if (attempt < attempts) {
			await wait(retryDelayMs);
		}
	}

	return { value: null, lastError };
}

/**
 * アセット ID から本体を取得する。
 *
 * 返ってくるのは「上げたファイル」ではなく「Roblox が保持している形」。Model は
 * MeshPart 化済みの .rbxm、画像は元の画像バイト列になる (画像の場合ここへ渡すのは
 * Decal ID ではなく中身の Image ID)。
 * @param {string | number} assetId - アセット ID ("rbxassetid://" 前置きも可)
 * @param {{ apiKey?: string, version?: string | number, attempts?: number, retryDelayMs?: number, fetchAsset?: (url: string, headers: object) => Promise<Buffer|string>, wait?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<Buffer>} アセット本体
 * @throws 取得できなかった場合
 */
async function fetchAssetContent(assetId, options = {}) {
	const id = normalizeAssetId(assetId, "asset");
	const { value, lastError } = await deliverAsset(id, options, (body) =>
		Buffer.isBuffer(body) ? body : Buffer.from(String(body), "latin1"),
	);
	if (value) return value;

	const detail = lastError ? `: ${lastError.message}` : " (the asset delivery response had no location)";
	throw new Error(`could not fetch the contents of asset ${id}${detail}`);
}

/**
 * Decal のアセット ID から、中身の Image アセット ID を取得する。
 * @param {string | number} decalId - Decal のアセット ID ("rbxassetid://" 前置きも可)
 * @param {{ apiKey?: string, attempts?: number, retryDelayMs?: number, fetchAsset?: (url: string, headers: object) => Promise<Buffer|string>, wait?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<string>} Image アセット ID (数値文字列)
 * @throws 解決できなかった場合
 */
async function fetchDecalImageId(decalId, options = {}) {
	const id = normalizeAssetId(decalId, "decal asset");
	const { value, lastError } = await deliverAsset(id, options, extractImageIdFromAssetBody);
	if (value) return value;

	const detail = lastError ? `: ${lastError.message}` : " (no image id in the asset body)";
	throw new Error(`could not resolve the image id of decal ${id}${detail}`);
}

module.exports = {
	fetchAssetContent,
	fetchDecalImageId,
	extractImageIdFromAssetBody,
	parseAssetLocation,
	assetDeliveryEndpoints,
	fetchAssetBody,
};
