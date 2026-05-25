const { existsSync, readFileSync } = require("fs");
const path = require("path");

function normalizeAssetPath(value) {
	return value.replace(/\\/g, "/");
}

function assetIdString(assetId) {
	const value = String(assetId);
	return value.startsWith("rbxassetid://") ? value : `rbxassetid://${value}`;
}

function lockPathForSync(syncConfig, cwd = process.cwd()) {
	const assetDir = path.resolve(cwd, syncConfig.path);
	return path.join(assetDir, `${syncConfig.name}.lock.json`);
}

function loadLockForSync(syncConfig, cwd = process.cwd()) {
	const lockPath = lockPathForSync(syncConfig, cwd);
	if (!existsSync(lockPath)) {
		return {};
	}

	return JSON.parse(readFileSync(lockPath, "utf8"));
}

function buildAssetMap(config, cwd = process.cwd()) {
	const result = {
		bySourcePath: {},
		byRelativePath: {},
		groups: {},
	};

	for (const syncConfig of config.sync || []) {
		const assetDir = path.resolve(cwd, syncConfig.path);
		const lock = loadLockForSync(syncConfig, cwd);
		const group = {};

		for (const [lockKey, entry] of Object.entries(lock)) {
			if (!entry || entry.assetId == null) {
				continue;
			}

			const normalizedKey = normalizeAssetPath(lockKey);
			const assetId = assetIdString(entry.assetId);
			const sourcePath = normalizeAssetPath(path.resolve(assetDir, normalizedKey));
			const cwdRelativePath = normalizeAssetPath(path.relative(cwd, sourcePath));

			group[normalizedKey] = assetId;
			result.bySourcePath[sourcePath] = assetId;
			result.byRelativePath[cwdRelativePath] = assetId;
			result.byRelativePath[normalizedKey] = result.byRelativePath[normalizedKey] || assetId;
			result.byRelativePath[`${syncConfig.name}/${normalizedKey}`] = assetId;
		}

		result.groups[syncConfig.name] = group;
	}

	return result;
}

module.exports = {
	assetIdString,
	buildAssetMap,
	loadLockForSync,
	lockPathForSync,
	normalizeAssetPath,
};
