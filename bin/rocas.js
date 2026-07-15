#!/usr/bin/env node

const { loadEnv, loadConfig } = require("../src/config");
const { syncAll } = require("../src/sync");
const { watchAll } = require("../src/watch");
const { writeStudioManifest, writeStudioPlugin } = require("../src/studio-plugin");
const path = require("path");

const HELP = `
rocas - Roblox Open Cloud Asset Sync

Usage:
  rocas sync       Sync all assets defined in rocas.toml
  rocas watch      Watch for file changes and sync automatically
  rocas plugin     Generate the static Roblox Studio plugin
  rocas manifest   Generate a ReplicatedStorage manifest module from lock files
  rocas manifest --local
                   Generate a manifest from local asset files without uploading
  rocas help       Show this help message

Options (watch):
  --debounce <ms> Debounce interval in ms (default: 10000)

Options (plugin):
  --output <path>  Output plugin path (default: Roblox Studio local Plugins folder)

Options (manifest):
  --output <path>  Output manifest ModuleScript path (default: src/shared/RocasManifest.luau)
  --local          Use local Studio temporary asset IDs instead of lock files

Environment:
  ROCAS_API_KEY    Roblox Open Cloud API key (or set in .env)
`;

async function main() {
	const command = process.argv[2];

	if (!command || command === "help" || command === "--help" || command === "-h") {
		console.log(HELP.trim());
		process.exit(0);
	}

	if (command !== "sync" && command !== "watch" && command !== "plugin" && command !== "studio-plugin" && command !== "manifest") {
		console.error(`Unknown command: ${command}`);
		console.log(HELP.trim());
		process.exit(1);
	}

	loadEnv();

	if (command === "plugin" || command === "studio-plugin") {
		const outputIdx = process.argv.indexOf("--output");
		const shortOutputIdx = process.argv.indexOf("-o");
		const selectedIdx = outputIdx !== -1 ? outputIdx : shortOutputIdx;
		const outputPath = selectedIdx !== -1 && process.argv[selectedIdx + 1] ? process.argv[selectedIdx + 1] : undefined;
		if (process.argv.includes("--local")) {
			console.error("plugin --local was removed. Use `rocas manifest --local` with the static plugin instead.");
			process.exit(1);
		}
		const pluginPath = writeStudioPlugin(null, process.cwd(), outputPath);
		const displayPath = outputPath ? path.relative(process.cwd(), pluginPath) : pluginPath;
		console.log(`Generated Studio plugin: ${displayPath}`);
		return;
	}

	const config = loadConfig();

	if (command === "manifest") {
		const outputIdx = process.argv.indexOf("--output");
		const shortOutputIdx = process.argv.indexOf("-o");
		const selectedIdx = outputIdx !== -1 ? outputIdx : shortOutputIdx;
		const outputPath = selectedIdx !== -1 && process.argv[selectedIdx + 1] ? process.argv[selectedIdx + 1] : undefined;
		const local = process.argv.includes("--local");
		const manifestPath = writeStudioManifest(config, process.cwd(), outputPath, { local });
		const displayPath = path.relative(process.cwd(), manifestPath);
		console.log(`Generated ${local ? "local " : ""}Studio manifest: ${displayPath}`);
		return;
	}

	const apiKey = process.env.ROCAS_API_KEY;
	if (!apiKey) {
		console.error("API key not found. Set ROCAS_API_KEY in .env or environment.");
		process.exit(1);
	}

	if (command === "watch") {
		let debounce;
		const debounceIdx = process.argv.indexOf("--debounce");
		if (debounceIdx !== -1 && process.argv[debounceIdx + 1]) {
			debounce = parseInt(process.argv[debounceIdx + 1], 10);
		}
		watchAll(config, apiKey, { debounce });
		return;
	}

	console.log(`Syncing ${config.sync.length} asset group(s)...`);
	await syncAll(config, apiKey);
	console.log("Done.");
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
