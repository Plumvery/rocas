const { generateLuau } = require("../codegen");

const luauFormat = {
	name: "luau",
	render(lock, varName, options = {}) {
		const { stripExtensions = false } = options;
		return [
			{
				extension: ".luau",
				content: generateLuau(lock, varName, {
					strict: true,
					stripExtensions,
				}),
			},
		];
	},
};

module.exports = luauFormat;
