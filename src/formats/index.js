const luauFormat = require("./luau");
const robloxTsFormat = require("./roblox-ts");

const DEFAULT_CODEGEN_FORMAT = luauFormat.name;
const CODEGEN_FORMATS = new Map();

function registerCodegenFormat(format) {
	if (!format || typeof format.name !== "string" || typeof format.render !== "function") {
		throw new Error("Codegen format must include a name and render function");
	}
	CODEGEN_FORMATS.set(format.name, format);
	return format;
}

registerCodegenFormat(luauFormat);
registerCodegenFormat(robloxTsFormat);

function listCodegenFormats() {
	return Array.from(CODEGEN_FORMATS.keys());
}

function resolveCodegenFormat(formatName = DEFAULT_CODEGEN_FORMAT) {
	const selectedFormat = formatName || DEFAULT_CODEGEN_FORMAT;
	const format = CODEGEN_FORMATS.get(selectedFormat);
	if (!format) {
		throw new Error(`Unsupported sync format: ${selectedFormat}. Expected one of: ${listCodegenFormats().join(", ")}`);
	}
	return format;
}

module.exports = {
	DEFAULT_CODEGEN_FORMAT,
	CODEGEN_FORMATS,
	listCodegenFormats,
	registerCodegenFormat,
	resolveCodegenFormat,
};
