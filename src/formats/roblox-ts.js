const { generateDts, generateLuau } = require("../codegen");

const robloxTsFormat = {
	name: "roblox-ts",
	render(lock, varName, options = {}) {
		const { stripExtensions = false } = options;
		return [
			{
				extension: ".luau",
				content: generateLuau(lock, varName, {
					strict: false,
					stripExtensions,
				}),
			},
			{
				extension: ".d.ts",
				content: generateDts(lock, varName, { stripExtensions }),
			},
		];
	},
};

module.exports = robloxTsFormat;
