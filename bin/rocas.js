#!/usr/bin/env node

const { loadEnv, loadConfig } = require("../src/config");
const { syncAll } = require("../src/sync");
const { watchAll } = require("../src/watch");
const { writeStudioPlugin } = require("../src/studio-plugin");
const path = require("path");

const HELP = `
rocas - Roblox Open Cloud Asset Sync

Usage:
  rocas sync       Sync all assets defined in rocas.toml
  rocas watch      Watch for file changes and sync automatically
  rocas plugin     Generate a Roblox Studio plugin from lock files
  rocas help       Show this help message

Options (watch):
  --debounce <ms> Debounce interval in ms (default: 10000)

Options (plugin):
  --output <path>  Output plugin path (default: Roblox Studio local Plugins folder)

Environment:
  ROCAS_API_KEY    Roblox Open Cloud API key (or set in .env)
`;

async function main() {
	const command = process.argv[2];

	if (!command || command === "help" || command === "--help" || command === "-h") {
		console.log(HELP.trim());
		process.exit(0);
	}

	if (command !== "sync" && command !== "watch" && command !== "plugin" && command !== "studio-plugin") {
		console.error(`Unknown command: ${command}`);
		console.log(HELP.trim());
		process.exit(1);
	}

	loadEnv();
	const config = loadConfig();

	if (command === "plugin" || command === "studio-plugin") {
		const outputIdx = process.argv.indexOf("--output");
		const shortOutputIdx = process.argv.indexOf("-o");
		const selectedIdx = outputIdx !== -1 ? outputIdx : shortOutputIdx;
		const outputPath = selectedIdx !== -1 && process.argv[selectedIdx + 1] ? process.argv[selectedIdx + 1] : undefined;
		const pluginPath = writeStudioPlugin(config, process.cwd(), outputPath);
		const displayPath = outputPath ? path.relative(process.cwd(), pluginPath) : pluginPath;
		console.log(`Generated Studio plugin: ${displayPath}`);
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
