const { loadEnv, loadConfig } = require("./config");
const { syncAll } = require("./sync");
const { uploadAsset } = require("./upload");
const { generateLuau, generateDts } = require("./codegen");
const { EXT_TO_ASSET_TYPE } = require("./sync");
const { watchAll } = require("./watch");
const { buildAssetMap, loadLockForSync, lockPathForSync, normalizeAssetPath } = require("./asset-map");
const { DEFAULT_CODEGEN_FORMAT, listCodegenFormats, registerCodegenFormat, resolveCodegenFormat } = require("./formats");
const {
	buildStudioPluginManifest,
	defaultStudioPluginOutputPath,
	generateStudioPlugin,
	resolveStudioPluginOutputPath,
	robloxStudioPluginsDir,
	writeStudioPlugin,
} = require("./studio-plugin");

module.exports = {
	loadEnv,
	loadConfig,
	syncAll,
	watchAll,
	uploadAsset,
	generateLuau,
	generateDts,
	EXT_TO_ASSET_TYPE,
	DEFAULT_CODEGEN_FORMAT,
	buildAssetMap,
	buildStudioPluginManifest,
	defaultStudioPluginOutputPath,
	generateStudioPlugin,
	listCodegenFormats,
	loadLockForSync,
	lockPathForSync,
	normalizeAssetPath,
	registerCodegenFormat,
	resolveCodegenFormat,
	resolveStudioPluginOutputPath,
	robloxStudioPluginsDir,
	writeStudioPlugin,
};
