const { loadEnv, loadConfig } = require("./config");
const { syncAll } = require("./sync");
const { uploadAsset } = require("./upload");
const { generateLuau, generateDts } = require("./codegen");
const { EXT_TO_ASSET_TYPE } = require("./sync");
const { watchAll } = require("./watch");
const { buildAssetMap, loadLockForSync, lockPathForSync, normalizeAssetPath } = require("./asset-map");

module.exports = {
	loadEnv,
	loadConfig,
	syncAll,
	watchAll,
	uploadAsset,
	generateLuau,
	generateDts,
	EXT_TO_ASSET_TYPE,
	buildAssetMap,
	loadLockForSync,
	lockPathForSync,
	normalizeAssetPath,
};
