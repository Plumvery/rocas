#!/usr/bin/env node

const { loadEnv, loadConfig } = require("../src/config");
const { syncAll } = require("../src/sync");
const { watchAll } = require("../src/watch");
const { fetchAll, DEFAULT_FETCH_DIR } = require("../src/fetch");
const {
	writeStudioManifest,
	writeStudioPlugin,
	writeStudioPluginLoader,
	writeStudioPluginModule,
} = require("../src/studio-plugin");
const path = require("path");

const HELP = `
rocas - Roblox Open Cloud Asset Sync

Usage:
  rocas sync       Sync all assets defined in rocas.toml
  rocas watch      Watch for file changes and sync automatically
  rocas fetch      Download the assets listed in the lock files
  rocas plugin     Generate the static Roblox Studio plugin
  rocas plugin --module
                   Generate the plugin as a ModuleScript to keep in your project
  rocas plugin --loader
                   Install the one-time loader that requires that module
  rocas manifest   Generate a ReplicatedStorage manifest module from lock files
  rocas manifest --local
                   Generate a manifest from local asset files without uploading
  rocas help       Show this help message

Options (watch):
  --debounce <ms> Debounce interval in ms (default: 10000)

Options (fetch):
  --group <name>       Only fetch this [[sync]] group (repeatable)
  --out, -o <dir>      Output directory (default: ${DEFAULT_FETCH_DIR})
                       Keep it outside every synced path — fetched files do not
                       match the originals byte for byte, so syncing them back
                       re-uploads them and changes their asset IDs.

Options (plugin):
  --output, -o <path>  Output plugin path (default: Roblox Studio local Plugins folder)
  --module             Write the plugin as a ModuleScript for your project
                       (default: src/server/RocasPlugin.luau) instead of a
                       baked plugin file. Sync it into the place and let the
                       loader require it; editing it reloads the window.
  --loader             Write the one-time loader plugin into the Studio local
                       Plugins folder (default: rocas-loader.rbxm)

Options (manifest):
  --output, -o <path>  Output manifest ModuleScript path (default: src/shared/RocasManifest.luau)
  --local              Use local Studio temporary asset IDs instead of lock files

Environment:
  ROCAS_API_KEY    Roblox Open Cloud API key (or set in .env)
`;

async function main() {
	const command = process.argv[2];

	if (!command || command === "help" || command === "--help" || command === "-h") {
		console.log(HELP.trim());
		process.exit(0);
	}

	if (
		command !== "sync" &&
		command !== "watch" &&
		command !== "fetch" &&
		command !== "plugin" &&
		command !== "studio-plugin" &&
		command !== "manifest"
	) {
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

		if (process.argv.includes("--module")) {
			const modulePath = writeStudioPluginModule(null, process.cwd(), outputPath);
			console.log(`Generated Studio plugin module: ${path.relative(process.cwd(), modulePath)}`);
			console.log("Sync it into the place (ServerStorage is recommended), then install the loader once:");
			console.log("  rocas plugin --loader");
			return;
		}

		if (process.argv.includes("--loader")) {
			const loaderPath = writeStudioPluginLoader(null, process.cwd(), outputPath);
			const displayPath = outputPath ? path.relative(process.cwd(), loaderPath) : loaderPath;
			console.log(`Generated Studio plugin loader: ${displayPath}`);
			console.log("Restart Studio once to load it. It requires the RocasPlugin module synced into the place.");
			return;
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

	if (command === "fetch") {
		const groups = [];
		for (let i = 3; i < process.argv.length; i++) {
			if (process.argv[i] === "--group" && process.argv[i + 1]) groups.push(process.argv[++i]);
		}
		const outIdx = process.argv.indexOf("--out");
		const shortOutIdx = process.argv.indexOf("-o");
		const selectedOutIdx = outIdx !== -1 ? outIdx : shortOutIdx;
		const out = selectedOutIdx !== -1 && process.argv[selectedOutIdx + 1] ? process.argv[selectedOutIdx + 1] : undefined;

		const result = await fetchAll(config, apiKey, process.cwd(), { groups, out });
		const displayPath = path.relative(process.cwd(), result.outDir) || ".";
		console.log(
			`Fetched ${result.fetched} asset(s) into ${displayPath} (${result.reused} already up to date, ${result.failed} failed).`,
		);
		if (result.failed > 0) process.exit(1);
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
