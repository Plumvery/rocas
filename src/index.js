const { loadEnv, loadConfig } = require("./config");
const { syncAll } = require("./sync");
const { uploadAsset, updateAsset } = require("./upload");
const { generateLuau, generateDts } = require("./codegen");
const { EXT_TO_ASSET_TYPE } = require("./sync");
const { watchAll } = require("./watch");
const { fetchDecalImageId, extractImageIdFromAssetBody } = require("./image-id");
const { buildAssetMap, loadLockForSync, lockPathForSync, normalizeAssetPath, resolveEntryAssetId } = require("./asset-map");
const { DEFAULT_CODEGEN_FORMAT, listCodegenFormats, registerCodegenFormat, resolveCodegenFormat } = require("./formats");
const {
	buildStudioPluginManifest,
	defaultStudioPluginOutputPath,
	generateManifestModule,
	generateStudioPlugin,
	generateStudioPluginRbxm,
	generateStudioPluginRbxmx,
	resolveManifestOutputPath,
	resolveStudioPluginOutputPath,
	robloxStudioPluginsDir,
	writeStudioManifest,
	writeStudioPlugin,
} = require("./studio-plugin");

module.exports = {
	loadEnv,
	loadConfig,
	syncAll,
	watchAll,
	uploadAsset,
	updateAsset,
	fetchDecalImageId,
	extractImageIdFromAssetBody,
	generateLuau,
	generateDts,
	EXT_TO_ASSET_TYPE,
	DEFAULT_CODEGEN_FORMAT,
	buildAssetMap,
	buildStudioPluginManifest,
	defaultStudioPluginOutputPath,
	generateManifestModule,
	generateStudioPlugin,
	generateStudioPluginRbxm,
	generateStudioPluginRbxmx,
	listCodegenFormats,
	loadLockForSync,
	lockPathForSync,
	normalizeAssetPath,
	registerCodegenFormat,
	resolveEntryAssetId,
	resolveManifestOutputPath,
	resolveCodegenFormat,
	resolveStudioPluginOutputPath,
	robloxStudioPluginsDir,
	writeStudioManifest,
	writeStudioPlugin,
};
