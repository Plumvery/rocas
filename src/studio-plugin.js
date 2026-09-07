const { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } = require("fs");
const path = require("path");
const { RobloxFile, Script } = require("rbxm-parser");
const { EXT_TO_ASSET_TYPE, CONVERTED_EXT_TO_ASSET_TYPE, walkDir } = require("./sync");
const { assetIdString, normalizeAssetPath, resolveEntryAssetId } = require("./asset-map");

const DEFAULT_PLUGIN_FILE_NAME = "rocas-studio-plugin.rbxm";
const DEFAULT_MANIFEST_OUTPUT_PATH = path.join("src", "shared", "RocasManifest.luau");

function inferAssetType(relPath, syncConfig) {
	if (syncConfig.assetType) {
		return syncConfig.assetType;
	}

	// 変換される形式 (.fbx など) は sync の自動判定からは外してあるが、
	// 「このファイルは何か」を示すだけのここでは従来どおり Model と呼ぶ。
	const ext = path.extname(relPath).toLowerCase();
	return EXT_TO_ASSET_TYPE[ext] || CONVERTED_EXT_TO_ASSET_TYPE[ext] || "Unknown";
}

function fileNameFromAssetPath(assetPath) {
	const parts = normalizeAssetPath(assetPath).split("/");
	return parts[parts.length - 1] || assetPath;
}

function sortManifestAssets(manifest) {
	manifest.assets.sort((a, b) => {
		const groupCompare = a.group.localeCompare(b.group);
		if (groupCompare !== 0) return groupCompare;
		return a.path.localeCompare(b.path);
	});

	return manifest;
}

function buildStudioPluginManifest(config, cwd = process.cwd(), options = {}) {
	const localMode = options.local || false;
	const manifest = {
		generatedBy: "rocas",
		mode: localMode ? "local" : "uploaded",
		assets: [],
	};

	for (const syncConfig of config.sync || []) {
		const assetDir = path.resolve(cwd, syncConfig.path);

		if (localMode) {
			for (const { filePath, relPath } of walkDir(assetDir)) {
				const assetPath = normalizeAssetPath(relPath);
				const assetType = inferAssetType(assetPath, syncConfig);
				if (assetType === "Unknown") {
					continue;
				}

				manifest.assets.push({
					group: syncConfig.name,
					path: assetPath,
					name: fileNameFromAssetPath(assetPath),
					sourcePath: normalizeAssetPath(path.relative(cwd, filePath)),
					size: statSync(filePath).size,
					assetType,
					source: "local",
				});
			}

			continue;
		}

		const lockPath = path.join(assetDir, `${syncConfig.name}.lock.json`);

		if (!existsSync(lockPath)) {
			continue;
		}

		const lock = JSON.parse(readFileSync(lockPath, "utf8"));

		for (const [lockKey, entry] of Object.entries(lock)) {
			const entryAssetId = resolveEntryAssetId(entry);
			if (entryAssetId == null) {
				continue;
			}

			const assetPath = normalizeAssetPath(lockKey);
			const sourcePath = normalizeAssetPath(path.relative(cwd, path.resolve(assetDir, assetPath)));

			manifest.assets.push({
				group: syncConfig.name,
				path: assetPath,
				name: fileNameFromAssetPath(assetPath),
				sourcePath,
				assetId: assetIdString(entryAssetId),
				assetType: inferAssetType(assetPath, syncConfig),
				source: "uploaded",
			});
		}
	}

	return sortManifestAssets(manifest);
}

function luaLongString(value) {
	for (let equals = 0; equals < 8; equals++) {
		const marker = "=".repeat(equals);
		const open = `[${marker}[`;
		const close = `]${marker}]`;
		if (!value.includes(close)) {
			return `${open}${value}${close}`;
		}
	}

	throw new Error("Unable to encode manifest as a Lua long string");
}

function generateStudioPlugin() {
	return STUDIO_PLUGIN_TEMPLATE;
}

function generateStudioPluginRbxm(source = generateStudioPlugin()) {
	const file = new RobloxFile();
	const script = new Script();
	script.Name = "rocas";
	script.Source = source;
	script.Disabled = false;
	file.AddRoot(script);
	return file.WriteToBuffer();
}

function cdata(value) {
	return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function xmlText(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function generateStudioPluginRbxmx(source = generateStudioPlugin()) {
	return [
		'<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">',
		"\t<External>null</External>",
		"\t<External>nil</External>",
		'\t<Item class="Script" referent="RBX726F63617353545544494F504C554749">',
		"\t\t<Properties>",
		`\t\t\t<ProtectedString name="Source">${cdata(source)}</ProtectedString>`,
		'\t\t\t<bool name="Disabled">false</bool>',
		'\t\t\t<Content name="LinkedSource"><null></null></Content>',
		'\t\t\t<token name="RunContext">0</token>',
		'\t\t\t<string name="ScriptGuid">{6E17590C-AD9D-4E56-9306-000000000001}</string>',
		'\t\t\t<BinaryString name="AttributesSerialize"></BinaryString>',
		'\t\t\t<SecurityCapabilities name="Capabilities">0</SecurityCapabilities>',
		'\t\t\t<bool name="DefinesCapabilities">false</bool>',
		`\t\t\t<string name="Name">${xmlText("rocas")}</string>`,
		'\t\t\t<int64 name="SourceAssetId">-1</int64>',
		'\t\t\t<BinaryString name="Tags"></BinaryString>',
		"\t\t</Properties>",
		"\t</Item>",
		"</roblox>",
		"",
	].join("\n");
}

function generateManifestModule(manifest) {
	const manifestJson = JSON.stringify(manifest, null, 2);
	return [
		"-- This file is auto-generated by rocas. Do not edit manually.",
		"local HttpService = game:GetService(\"HttpService\")",
		"-- ROCAS_MANIFEST_JSON_BEGIN",
		`local manifestJson = ${luaLongString(manifestJson)}`,
		"-- ROCAS_MANIFEST_JSON_END",
		"return HttpService:JSONDecode(manifestJson)",
		"",
	].join("\n");
}

function robloxStudioPluginsDir(env = process.env, platform = process.platform) {
	if (platform === "win32" && env.LOCALAPPDATA) {
		return path.join(env.LOCALAPPDATA, "Roblox", "Plugins");
	}

	if (env.HOME) {
		return path.join(env.HOME, "Documents", "Roblox", "Plugins");
	}

	return null;
}

function defaultStudioPluginOutputPath(cwd = process.cwd(), env = process.env, platform = process.platform) {
	const pluginsDir = robloxStudioPluginsDir(env, platform);
	return path.join(pluginsDir || cwd, DEFAULT_PLUGIN_FILE_NAME);
}

function resolveStudioPluginOutputPath(cwd = process.cwd(), outputPath) {
	if (outputPath) {
		return path.resolve(cwd, outputPath);
	}

	return defaultStudioPluginOutputPath(cwd);
}

function resolveManifestOutputPath(cwd = process.cwd(), outputPath) {
	return path.resolve(cwd, outputPath || DEFAULT_MANIFEST_OUTPUT_PATH);
}

function writeStudioPlugin(config, cwd = process.cwd(), outputPath, options = {}) {
	const resolvedOutput = resolveStudioPluginOutputPath(cwd, outputPath);
	const extension = path.extname(resolvedOutput).toLowerCase();
	const source =
		extension === ".lua" || extension === ".luau"
			? generateStudioPlugin()
			: extension === ".rbxmx"
				? generateStudioPluginRbxmx()
				: generateStudioPluginRbxm();
	const outputDir = path.dirname(resolvedOutput);

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const existing = existsSync(resolvedOutput) ? readFileSync(resolvedOutput) : null;
	const next = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
	if (!existing || !existing.equals(next)) {
		writeFileSync(resolvedOutput, source);
	}

	return resolvedOutput;
}

function writeStudioManifest(config, cwd = process.cwd(), outputPath, options = {}) {
	const resolvedOutput = resolveManifestOutputPath(cwd, outputPath);
	const manifest = buildStudioPluginManifest(config, cwd, options);
	const source = generateManifestModule(manifest);
	const outputDir = path.dirname(resolvedOutput);

	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	if (!existsSync(resolvedOutput) || readFileSync(resolvedOutput, "utf8") !== source) {
		writeFileSync(resolvedOutput, source);
	}

	return resolvedOutput;
}

const STUDIO_PLUGIN_TEMPLATE = `-- This file is auto-generated by rocas. Do not edit manually.
-- Put it in the Roblox Studio local Plugins folder to use the asset browser.

local InsertService = game:GetService("InsertService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Selection = game:GetService("Selection")
local SoundService = game:GetService("SoundService")
local StarterGui = game:GetService("StarterGui")
local StudioService = game:GetService("StudioService")
local Workspace = game:GetService("Workspace")

local manifest = { generatedBy = "rocas", mode = "uploaded", assets = {} }
local assets = {}
local localMode = false

local toolbar = plugin:CreateToolbar("rocas")
local toggleButton = toolbar:CreateButton("Assets", "Browse rocas synced assets", "")
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	false,
	true,
	380,
	560,
	320,
	360
)

local widget = plugin:CreateDockWidgetPluginGui("rocasAssetBrowser", widgetInfo)
widget.Title = "rocas Assets"

local root = Instance.new("Frame")
root.Name = "Root"
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(24, 26, 30)
root.BorderSizePixel = 0
root.Parent = widget

local rootPadding = Instance.new("UIPadding")
rootPadding.PaddingTop = UDim.new(0, 12)
rootPadding.PaddingRight = UDim.new(0, 12)
rootPadding.PaddingBottom = UDim.new(0, 12)
rootPadding.PaddingLeft = UDim.new(0, 12)
rootPadding.Parent = root

local layout = Instance.new("UIListLayout")
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Padding = UDim.new(0, 8)
layout.Parent = root

local header = Instance.new("TextLabel")
header.Name = "Header"
header.LayoutOrder = 1
header.Size = UDim2.new(1, 0, 0, 24)
header.BackgroundTransparency = 1
header.Font = Enum.Font.GothamBold
header.Text = "rocas Assets"
header.TextColor3 = Color3.fromRGB(244, 246, 248)
header.TextSize = 18
header.TextXAlignment = Enum.TextXAlignment.Left
header.Parent = root

local generatedAt = Instance.new("TextLabel")
generatedAt.Name = "GeneratedAt"
generatedAt.LayoutOrder = 2
generatedAt.Size = UDim2.new(1, 0, 0, 18)
generatedAt.BackgroundTransparency = 1
generatedAt.Font = Enum.Font.Gotham
generatedAt.Text = "Manifest not loaded"
generatedAt.TextColor3 = Color3.fromRGB(150, 156, 166)
generatedAt.TextSize = 11
generatedAt.TextTruncate = Enum.TextTruncate.AtEnd
generatedAt.TextXAlignment = Enum.TextXAlignment.Left
generatedAt.Parent = root

local localActions = Instance.new("Frame")
localActions.Name = "LocalActions"
localActions.LayoutOrder = 3
localActions.Size = localMode and UDim2.new(1, 0, 0, 30) or UDim2.new(1, 0, 0, 0)
localActions.BackgroundTransparency = 1
localActions.Visible = localMode
localActions.Parent = root

local localActionsLayout = Instance.new("UIListLayout")
localActionsLayout.FillDirection = Enum.FillDirection.Horizontal
localActionsLayout.SortOrder = Enum.SortOrder.LayoutOrder
localActionsLayout.Padding = UDim.new(0, 8)
localActionsLayout.Parent = localActions

local importButton = Instance.new("TextButton")
importButton.Name = "ImportFiles"
importButton.LayoutOrder = 1
importButton.Size = UDim2.fromOffset(96, 30)
importButton.BackgroundColor3 = Color3.fromRGB(232, 236, 242)
importButton.BorderSizePixel = 0
importButton.Font = Enum.Font.GothamBold
importButton.Text = "Import"
importButton.TextColor3 = Color3.fromRGB(20, 22, 25)
importButton.TextSize = 12
importButton.Parent = localActions

local importCorner = Instance.new("UICorner")
importCorner.CornerRadius = UDim.new(0, 6)
importCorner.Parent = importButton

local localModeLabel = Instance.new("TextLabel")
localModeLabel.Name = "LocalMode"
localModeLabel.LayoutOrder = 2
localModeLabel.Size = UDim2.new(1, -104, 0, 30)
localModeLabel.BackgroundTransparency = 1
localModeLabel.Font = Enum.Font.Gotham
localModeLabel.Text = "Local preview"
localModeLabel.TextColor3 = Color3.fromRGB(150, 156, 166)
localModeLabel.TextSize = 12
localModeLabel.TextTruncate = Enum.TextTruncate.AtEnd
localModeLabel.TextXAlignment = Enum.TextXAlignment.Left
localModeLabel.Parent = localActions

local searchBox = Instance.new("TextBox")
searchBox.Name = "Search"
searchBox.LayoutOrder = 4
searchBox.Size = UDim2.new(1, 0, 0, 34)
searchBox.BackgroundColor3 = Color3.fromRGB(35, 38, 44)
searchBox.BorderSizePixel = 0
searchBox.ClearTextOnFocus = false
searchBox.Font = Enum.Font.Gotham
searchBox.PlaceholderText = "Search"
searchBox.PlaceholderColor3 = Color3.fromRGB(125, 132, 144)
searchBox.Text = ""
searchBox.TextColor3 = Color3.fromRGB(238, 241, 245)
searchBox.TextSize = 14
searchBox.TextXAlignment = Enum.TextXAlignment.Left
searchBox.Parent = root

local searchPadding = Instance.new("UIPadding")
searchPadding.PaddingLeft = UDim.new(0, 10)
searchPadding.PaddingRight = UDim.new(0, 10)
searchPadding.Parent = searchBox

local searchCorner = Instance.new("UICorner")
searchCorner.CornerRadius = UDim.new(0, 6)
searchCorner.Parent = searchBox

local filters = Instance.new("Frame")
filters.Name = "Filters"
filters.LayoutOrder = 5
filters.Size = UDim2.new(1, 0, 0, 28)
filters.BackgroundTransparency = 1
filters.Parent = root

local filterLayout = Instance.new("UIListLayout")
filterLayout.FillDirection = Enum.FillDirection.Horizontal
filterLayout.SortOrder = Enum.SortOrder.LayoutOrder
filterLayout.Padding = UDim.new(0, 6)
filterLayout.Parent = filters

local list = Instance.new("ScrollingFrame")
list.Name = "AssetList"
list.LayoutOrder = 6
list.Size = localMode and UDim2.new(1, 0, 1, -202) or UDim2.new(1, 0, 1, -164)
list.BackgroundTransparency = 1
list.BorderSizePixel = 0
list.CanvasSize = UDim2.fromOffset(0, 0)
list.ScrollBarThickness = 6
list.AutomaticCanvasSize = Enum.AutomaticSize.None
list.Parent = root

local listLayout = Instance.new("UIListLayout")
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Padding = UDim.new(0, 8)
listLayout.Parent = list

local status = Instance.new("TextLabel")
status.Name = "Status"
status.LayoutOrder = 7
status.Size = UDim2.new(1, 0, 0, 20)
status.BackgroundTransparency = 1
status.Font = Enum.Font.Gotham
status.Text = ""
status.TextColor3 = Color3.fromRGB(158, 165, 176)
status.TextSize = 12
status.TextTruncate = Enum.TextTruncate.AtEnd
status.TextXAlignment = Enum.TextXAlignment.Left
status.Parent = root

local selectedType = "All"
local filterButtons = {}
local filterValues = {
	{ label = "All", value = "All", width = 40 },
	{ label = "Image", value = "Decal", width = 48 },
	{ label = "Audio", value = "Audio", width = 48 },
	{ label = "Model", value = "Model", width = 48 },
	{ label = "Anim", value = "Animation", width = 42 },
	{ label = "Video", value = "Video", width = 48 },
}

local typeColors = {
	Decal = Color3.fromRGB(54, 141, 214),
	Audio = Color3.fromRGB(77, 173, 96),
	Model = Color3.fromRGB(217, 145, 57),
	Animation = Color3.fromRGB(165, 110, 226),
	Video = Color3.fromRGB(216, 82, 103),
	Unknown = Color3.fromRGB(120, 126, 138),
}

local usageByAssetKey = {}
local localAssetIds = {}
local localFileRefs = {}
local localAssetsByFileMatch = {}
local watchedScripts = {}
local watchedScriptCount = 0
local usageScanScheduled = false
local renderList
local keySeparator = string.char(0)

local function assetKey(asset)
	return tostring(asset.group or "") .. keySeparator .. tostring(asset.path or "")
end

local function currentAssetId(asset)
	local key = assetKey(asset)
	return localAssetIds[key] or asset.assetId
end

local function isAssetReady(asset)
	local assetId = currentAssetId(asset)
	return assetId ~= nil and tostring(assetId) ~= ""
end

local function displayAssetId(asset)
	if isAssetReady(asset) then
		return tostring(currentAssetId(asset))
	end

	return localMode and "Not imported" or ""
end

local function rebuildLocalAssetIndex()
	localAssetsByFileMatch = {}
	if not localMode then
		return
	end

	for _, asset in ipairs(assets) do
		local name = tostring(asset.name or "")
		local size = tostring(asset.size or "")
		local matchKey = name .. keySeparator .. size
		local matches = localAssetsByFileMatch[matchKey]
		if not matches then
			matches = {}
			localAssetsByFileMatch[matchKey] = matches
		end
		table.insert(matches, asset)
	end
end

local function sanitizeName(value)
	local name = tostring(value or "Asset"):gsub("%.[^%.]+$", "")
	name = name:gsub("[^%w%s_%-]", "_")
	name = name:gsub("^%s+", ""):gsub("%s+$", "")
	if name == "" then
		return "rocas Asset"
	end
	return name
end

local function numericAssetId(assetId)
	return tonumber(tostring(assetId or ""):match("%d+"))
end

local function isScriptLike(instance)
	return instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript")
end

local function readScriptSource(instance)
	local ok, source = pcall(function()
		return instance.Source
	end)

	if ok and type(source) == "string" then
		return source
	end

	return nil
end

local function assetSearchTokens(asset)
	local tokens = {}
	local seen = {}
	local assetId = currentAssetId(asset)

	local function addToken(value)
		local token = tostring(value or "")
		if token ~= "" and not seen[token] then
			seen[token] = true
			table.insert(tokens, token)
		end
	end

	addToken(assetId)
	addToken(numericAssetId(assetId))
	addToken(asset.path)
	addToken(tostring(asset.path or ""):gsub("%.[^%.]+$", ""))
	addToken(asset.name)
	addToken(tostring(asset.name or ""):gsub("%.[^%.]+$", ""))

	return tokens
end

local function ensureFolder(parent, folderName)
	local existing = parent:FindFirstChild(folderName)
	if existing and existing:IsA("Folder") then
		return existing
	end

	local folder = Instance.new("Folder")
	folder.Name = folderName
	folder.Parent = parent
	return folder
end

local function ensureScreenGui(name)
	local existing = StarterGui:FindFirstChild(name)
	if existing and existing:IsA("ScreenGui") then
		return existing
	end

	local screenGui = Instance.new("ScreenGui")
	screenGui.Name = name
	screenGui.ResetOnSpawn = false
	screenGui.Parent = StarterGui
	return screenGui
end

local function selectedBasePart()
	for _, instance in ipairs(Selection:Get()) do
		if instance:IsA("BasePart") then
			return instance
		end

		local ancestor = instance:FindFirstAncestorWhichIsA("BasePart")
		if ancestor then
			return ancestor
		end
	end

	return nil
end

local function placeDecal(asset)
	local assetId = currentAssetId(asset)
	local name = sanitizeName(asset.name or asset.path)
	local part = selectedBasePart()
	if part then
		local decal = Instance.new("Decal")
		decal.Name = name
		decal.Texture = assetId
		decal.Face = Enum.NormalId.Front
		decal.Parent = part
		return decal
	end

	local screenGui = ensureScreenGui("rocas Images")
	local imageLabel = Instance.new("ImageLabel")
	imageLabel.Name = name
	imageLabel.BackgroundTransparency = 1
	imageLabel.Image = assetId
	imageLabel.Size = UDim2.fromOffset(256, 256)
	imageLabel.Parent = screenGui
	return imageLabel
end

local function placeAudio(asset)
	local assetId = currentAssetId(asset)
	local sound = Instance.new("Sound")
	sound.Name = sanitizeName(asset.name or asset.path)
	sound.SoundId = assetId
	sound.Parent = SoundService
	return sound
end

local function placeAnimation(asset)
	local assetId = currentAssetId(asset)
	local folder = ensureFolder(ReplicatedStorage, "rocas Animations")
	local animation = Instance.new("Animation")
	animation.Name = sanitizeName(asset.name or asset.path)
	animation.AnimationId = assetId
	animation.Parent = folder
	return animation
end

local function placeVideo(asset)
	local assetId = currentAssetId(asset)
	local screenGui = ensureScreenGui("rocas Videos")
	local videoFrame = Instance.new("VideoFrame")
	videoFrame.Name = sanitizeName(asset.name or asset.path)
	videoFrame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	videoFrame.Size = UDim2.fromOffset(320, 180)
	videoFrame.Video = assetId
	videoFrame.Parent = screenGui
	return videoFrame
end

local function placeModel(asset)
	local assetId = currentAssetId(asset)
	local id = numericAssetId(assetId)
	local container

	if id then
		container = InsertService:LoadAsset(id)
	else
		local objects = game:GetObjects(assetId)
		if #objects == 1 and objects[1]:IsA("Model") then
			container = objects[1]
		else
			container = Instance.new("Model")
			for _, object in ipairs(objects) do
				object.Parent = container
			end
		end
	end

	container.Name = sanitizeName(asset.name or asset.path)

	local children = container:GetChildren()
	if #children == 1 then
		local child = children[1]
		child.Name = container.Name
		child.Parent = Workspace
		container:Destroy()
		return child
	end

	container.Parent = Workspace
	return container
end

local function placeAsset(asset)
	if not isAssetReady(asset) then
		error("Import this local asset first")
	end

	if asset.assetType == "Decal" then
		return placeDecal(asset)
	elseif asset.assetType == "Audio" then
		return placeAudio(asset)
	elseif asset.assetType == "Animation" then
		return placeAnimation(asset)
	elseif asset.assetType == "Video" then
		return placeVideo(asset)
	elseif asset.assetType == "Model" then
		return placeModel(asset)
	end

	error("Unsupported asset type: " .. tostring(asset.assetType))
end

local function setStatus(message, isError)
	status.Text = message
	if isError then
		status.TextColor3 = Color3.fromRGB(239, 111, 111)
	else
		status.TextColor3 = Color3.fromRGB(158, 165, 176)
	end
end

local function extensionForAsset(asset)
	return tostring(asset.name or asset.path or ""):match("%.([^%.]+)$")
end

local function supportedLocalExtensions()
	local seen = {}
	local extensions = {}

	for _, asset in ipairs(assets) do
		local extension = extensionForAsset(asset)
		if extension then
			extension = string.lower(extension)
			if not seen[extension] then
				seen[extension] = true
				table.insert(extensions, extension)
			end
		end
	end

	return extensions
end

local function setLocalFileForAsset(asset, file)
	local ok, tempId = pcall(function()
		return file:GetTemporaryId()
	end)

	if not ok then
		return false, tostring(tempId)
	end

	local key = assetKey(asset)
	localAssetIds[key] = tostring(tempId)
	localFileRefs[key] = file
	return true
end

local function importLocalFile(file)
	local matchKey = tostring(file.Name or "") .. keySeparator .. tostring(file.Size or "")
	local matches = localAssetsByFileMatch[matchKey]
	if not matches then
		return 0
	end

	local imported = 0
	for _, asset in ipairs(matches) do
		local ok = setLocalFileForAsset(asset, file)
		if ok then
			imported = imported + 1
		end
	end

	return imported
end

local function importLocalFiles()
	if not localMode then
		return
	end

	local extensions = supportedLocalExtensions()
	local ok, files = pcall(function()
		return StudioService:PromptImportFilesAsync(extensions)
	end)

	if not ok then
		setStatus(tostring(files), true)
		return
	end

	if not files then
		return
	end

	local imported = 0
	local unmatched = 0
	for _, file in ipairs(files) do
		local count = importLocalFile(file)
		if count == 0 then
			unmatched = unmatched + 1
		end
		imported = imported + count
	end

	renderList()
	if unmatched > 0 then
		setStatus("Imported " .. tostring(imported) .. " asset(s); " .. tostring(unmatched) .. " unmatched file(s)", false)
	else
		setStatus("Imported " .. tostring(imported) .. " local asset(s)", false)
	end
end

local function loadLocalAsset(asset)
	local extension = extensionForAsset(asset)
	local ok, file = pcall(function()
		if extension then
			return StudioService:PromptImportFileAsync({ string.lower(extension) })
		end

		return StudioService:PromptImportFileAsync()
	end)

	if not ok then
		setStatus(tostring(file), true)
		return false
	end

	if not file then
		return false
	end

	local loaded, message = setLocalFileForAsset(asset, file)
	if not loaded then
		setStatus(message, true)
		return false
	end

	renderList()
	setStatus("Loaded " .. tostring(asset.name or asset.path or "asset"), false)
	return true
end

local function matchesFilter(asset)
	if selectedType ~= "All" and asset.assetType ~= selectedType then
		return false
	end

	local query = string.lower(searchBox.Text or "")
	if query == "" then
		return true
	end

	local haystack = string.lower(table.concat({
		tostring(asset.group or ""),
		tostring(asset.path or ""),
		tostring(asset.name or ""),
		tostring(currentAssetId(asset) or ""),
		tostring(asset.assetType or ""),
	}, " "))

	return string.find(haystack, query, 1, true) ~= nil
end

local function sourceUsesAsset(source, asset)
	local tokens = assetSearchTokens(asset)
	for _, token in ipairs(tokens) do
		if #token >= 4 and string.find(source, token, 1, true) then
			return true
		end
	end

	return false
end

local function rebuildUsage()
	local nextUsage = {}
	local nextWatchedScriptCount = 0

	for scriptInstance in pairs(watchedScripts) do
		if scriptInstance.Parent ~= nil then
			nextWatchedScriptCount = nextWatchedScriptCount + 1
			local source = readScriptSource(scriptInstance)

			if source and not string.find(source, "auto-generated by rocas", 1, true) then
				for _, asset in ipairs(assets) do
					if sourceUsesAsset(source, asset) then
						local key = assetKey(asset)
						nextUsage[key] = (nextUsage[key] or 0) + 1
					end
				end
			end
		end
	end

	usageByAssetKey = nextUsage
	watchedScriptCount = nextWatchedScriptCount
	renderList()
end

local function scheduleUsageScan()
	if usageScanScheduled then
		return
	end

	usageScanScheduled = true
	task.delay(0.2, function()
		usageScanScheduled = false
		rebuildUsage()
	end)
end

local function watchScript(instance)
	if not isScriptLike(instance) or watchedScripts[instance] then
		return
	end

	local ok, connection = pcall(function()
		return instance:GetPropertyChangedSignal("Source"):Connect(scheduleUsageScan)
	end)

	if ok and connection then
		watchedScripts[instance] = connection
		scheduleUsageScan()
	end
end

local function unwatchScript(instance)
	local connection = watchedScripts[instance]
	if not connection then
		return
	end

	connection:Disconnect()
	watchedScripts[instance] = nil
	scheduleUsageScan()
end

local manifestSourceConnections = {}
local manifestReloadScheduled = false
local reloadManifest
local scheduleManifestReload

local function decodeManifestJsonFromSource(source)
	local markerStart = string.find(source, "ROCAS_MANIFEST_JSON_BEGIN", 1, true)
	if not markerStart then
		return nil
	end

	local openStart, openEnd = string.find(source, "%[=*%[", markerStart)
	if not openStart then
		return nil
	end

	local open = string.sub(source, openStart, openEnd)
	local equals = string.match(open, "^%[(=*)%[$") or ""
	local close = "]" .. equals .. "]"
	local contentStart = openEnd + 1
	local contentEnd = string.find(source, close, contentStart, true)
	if not contentEnd then
		return nil
	end

	return string.sub(source, contentStart, contentEnd - 1)
end

local function readManifestFromModule(moduleScript)
	local source = readScriptSource(moduleScript)
	if not source then
		return nil
	end

	local manifestJson = decodeManifestJsonFromSource(source)
	if not manifestJson then
		return nil
	end

	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(manifestJson)
	end)

	if ok and type(decoded) == "table" and decoded.generatedBy == "rocas" then
		return decoded
	end

	return nil
end

local function findManifest()
	for _, descendant in ipairs(ReplicatedStorage:GetDescendants()) do
		if descendant:IsA("ModuleScript") then
			local nextManifest = readManifestFromModule(descendant)
			if nextManifest then
				return nextManifest, descendant
			end
		end
	end

	return nil, nil
end

local function applyManifest(nextManifest, sourceModule)
	local previousLocalAssetIds = localAssetIds
	local previousLocalFileRefs = localFileRefs
	manifest = nextManifest or { generatedBy = "rocas", mode = "uploaded", assets = {} }
	assets = manifest.assets or {}
	localMode = manifest.mode == "local"
	localAssetIds = {}
	localFileRefs = {}
	usageByAssetKey = {}
	if localMode then
		for _, asset in ipairs(assets) do
			local key = assetKey(asset)
			localAssetIds[key] = previousLocalAssetIds[key]
			localFileRefs[key] = previousLocalFileRefs[key]
		end
	end
	rebuildLocalAssetIndex()

	localActions.Visible = localMode
	localActions.Size = localMode and UDim2.new(1, 0, 0, 30) or UDim2.new(1, 0, 0, 0)
	list.Size = localMode and UDim2.new(1, 0, 1, -202) or UDim2.new(1, 0, 1, -164)

	if sourceModule then
		generatedAt.Text = "Manifest: " .. tostring(manifest.mode or "uploaded") .. " / " .. sourceModule:GetFullName()
	else
		generatedAt.Text = "Manifest not loaded"
	end

	scheduleUsageScan()
	if renderList then
		renderList()
	end
end

local function refreshManifestWatches()
	for _, connection in ipairs(manifestSourceConnections) do
		connection:Disconnect()
	end
	manifestSourceConnections = {}

	for _, descendant in ipairs(ReplicatedStorage:GetDescendants()) do
		if descendant:IsA("ModuleScript") then
			local ok, connection = pcall(function()
				return descendant:GetPropertyChangedSignal("Source"):Connect(function()
					if scheduleManifestReload then
						scheduleManifestReload()
					end
				end)
			end)

			if ok and connection then
				table.insert(manifestSourceConnections, connection)
			end
		end
	end
end

scheduleManifestReload = function()
	if manifestReloadScheduled then
		return
	end

	manifestReloadScheduled = true
	task.delay(0.2, function()
		manifestReloadScheduled = false
		if reloadManifest then
			reloadManifest()
		end
	end)
end

reloadManifest = function()
	refreshManifestWatches()
	local nextManifest, sourceModule = findManifest()
	applyManifest(nextManifest, sourceModule)
end

local function updateFilterButtons()
	for value, button in pairs(filterButtons) do
		local selected = value == selectedType
		if selected then
			button.BackgroundColor3 = Color3.fromRGB(232, 236, 242)
			button.TextColor3 = Color3.fromRGB(20, 22, 25)
		else
			button.BackgroundColor3 = Color3.fromRGB(35, 38, 44)
			button.TextColor3 = Color3.fromRGB(210, 215, 222)
		end
	end
end

local function clearRows()
	for _, child in ipairs(list:GetChildren()) do
		if child.Name == "AssetRow" then
			child:Destroy()
		end
	end
end

local function createRow(asset, index)
	local row = Instance.new("Frame")
	row.Name = "AssetRow"
	row.LayoutOrder = index
	row.Size = UDim2.new(1, -8, 0, 88)
	row.BackgroundColor3 = Color3.fromRGB(31, 34, 40)
	row.BorderSizePixel = 0
	row.Parent = list

	local rowCorner = Instance.new("UICorner")
	rowCorner.CornerRadius = UDim.new(0, 6)
	rowCorner.Parent = row

	local preview = Instance.new("Frame")
	preview.Name = "Preview"
	preview.Position = UDim2.fromOffset(10, 10)
	preview.Size = UDim2.fromOffset(56, 56)
	preview.BackgroundColor3 = typeColors[asset.assetType] or typeColors.Unknown
	preview.BorderSizePixel = 0
	preview.Parent = row

	local previewCorner = Instance.new("UICorner")
	previewCorner.CornerRadius = UDim.new(0, 6)
	previewCorner.Parent = preview

	if asset.assetType == "Decal" and isAssetReady(asset) then
		local thumbnail = Instance.new("ImageLabel")
		thumbnail.Name = "Thumbnail"
		thumbnail.Size = UDim2.fromScale(1, 1)
		thumbnail.BackgroundTransparency = 1
		thumbnail.Image = currentAssetId(asset)
		thumbnail.ScaleType = Enum.ScaleType.Crop
		thumbnail.Parent = preview
	else
		local typeInitial = Instance.new("TextLabel")
		typeInitial.Name = "TypeInitial"
		typeInitial.Size = UDim2.fromScale(1, 1)
		typeInitial.BackgroundTransparency = 1
		typeInitial.Font = Enum.Font.GothamBold
		typeInitial.Text = string.sub(tostring(asset.assetType or "?"), 1, 1)
		typeInitial.TextColor3 = Color3.fromRGB(255, 255, 255)
		typeInitial.TextSize = 22
		typeInitial.Parent = preview
	end

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.Position = UDim2.fromOffset(76, 9)
	title.Size = UDim2.new(1, -152, 0, 20)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamBold
	title.Text = tostring(asset.name or asset.path or "Asset")
	title.TextColor3 = Color3.fromRGB(242, 245, 248)
	title.TextSize = 13
	title.TextTruncate = Enum.TextTruncate.AtEnd
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = row

	local meta = Instance.new("TextLabel")
	meta.Name = "Meta"
	meta.Position = UDim2.fromOffset(76, 31)
	meta.Size = UDim2.new(1, -152, 0, 17)
	meta.BackgroundTransparency = 1
	meta.Font = Enum.Font.Gotham
	meta.Text = tostring(asset.group or "") .. " / " .. tostring(asset.path or "") .. " | Used in " .. tostring(usageByAssetKey[assetKey(asset)] or 0)
	meta.TextColor3 = Color3.fromRGB(156, 164, 176)
	meta.TextSize = 11
	meta.TextTruncate = Enum.TextTruncate.AtEnd
	meta.TextXAlignment = Enum.TextXAlignment.Left
	meta.Parent = row

	local assetId = Instance.new("TextBox")
	assetId.Name = "AssetId"
	assetId.Position = UDim2.fromOffset(76, 52)
	assetId.Size = UDim2.new(1, -152, 0, 22)
	assetId.BackgroundColor3 = Color3.fromRGB(23, 25, 30)
	assetId.BorderSizePixel = 0
	assetId.ClearTextOnFocus = false
	assetId.Font = Enum.Font.Code
	assetId.Text = displayAssetId(asset)
	assetId.TextColor3 = isAssetReady(asset) and Color3.fromRGB(202, 209, 219) or Color3.fromRGB(143, 151, 163)
	assetId.TextEditable = false
	assetId.TextSize = 11
	assetId.TextTruncate = Enum.TextTruncate.AtEnd
	assetId.TextXAlignment = Enum.TextXAlignment.Left
	assetId.Parent = row

	local assetIdPadding = Instance.new("UIPadding")
	assetIdPadding.PaddingLeft = UDim.new(0, 6)
	assetIdPadding.PaddingRight = UDim.new(0, 6)
	assetIdPadding.Parent = assetId

	local assetIdCorner = Instance.new("UICorner")
	assetIdCorner.CornerRadius = UDim.new(0, 4)
	assetIdCorner.Parent = assetId

	local typeBadge = Instance.new("TextLabel")
	typeBadge.Name = "Type"
	typeBadge.Position = UDim2.new(1, -68, 0, 10)
	typeBadge.Size = UDim2.fromOffset(58, 22)
	typeBadge.BackgroundColor3 = typeColors[asset.assetType] or typeColors.Unknown
	typeBadge.BorderSizePixel = 0
	typeBadge.Font = Enum.Font.GothamBold
	typeBadge.Text = tostring(asset.assetType or "Unknown")
	typeBadge.TextColor3 = Color3.fromRGB(255, 255, 255)
	typeBadge.TextSize = 10
	typeBadge.TextTruncate = Enum.TextTruncate.AtEnd
	typeBadge.Parent = row

	local badgeCorner = Instance.new("UICorner")
	badgeCorner.CornerRadius = UDim.new(0, 4)
	badgeCorner.Parent = typeBadge

	local insertButton = Instance.new("TextButton")
	insertButton.Name = "Insert"
	insertButton.Position = UDim2.new(1, -68, 1, -34)
	insertButton.Size = UDim2.fromOffset(58, 24)
	insertButton.BackgroundColor3 = Color3.fromRGB(232, 236, 242)
	insertButton.BorderSizePixel = 0
	insertButton.Font = Enum.Font.GothamBold
	insertButton.Text = localMode and not isAssetReady(asset) and "Load" or "Insert"
	insertButton.TextColor3 = Color3.fromRGB(20, 22, 25)
	insertButton.TextSize = 12
	insertButton.Parent = row

	local insertCorner = Instance.new("UICorner")
	insertCorner.CornerRadius = UDim.new(0, 4)
	insertCorner.Parent = insertButton

	insertButton.MouseButton1Click:Connect(function()
		if localMode and not isAssetReady(asset) then
			loadLocalAsset(asset)
			return
		end

		local ok, inserted = pcall(placeAsset, asset)
		if not ok then
			setStatus(tostring(inserted), true)
			return
		end

		if inserted then
			pcall(function()
				Selection:Set({ inserted })
			end)
		end

		setStatus("Inserted " .. tostring(asset.name or asset.path or "asset"), false)
	end)
end

function renderList()
	clearRows()

	local visible = 0
	for _, asset in ipairs(assets) do
		if matchesFilter(asset) then
			visible = visible + 1
			createRow(asset, visible)
		end
	end

	list.CanvasSize = UDim2.fromOffset(0, listLayout.AbsoluteContentSize.Y + 8)
	if localMode then
		local loaded = 0
		for _, asset in ipairs(assets) do
			if isAssetReady(asset) then
				loaded = loaded + 1
			end
		end
		setStatus(tostring(visible) .. " of " .. tostring(#assets) .. " assets, " .. tostring(loaded) .. " imported", false)
	else
		setStatus(tostring(visible) .. " of " .. tostring(#assets) .. " assets, watching " .. tostring(watchedScriptCount) .. " scripts", false)
	end
end

for index, filter in ipairs(filterValues) do
	local value = filter.value
	local button = Instance.new("TextButton")
	button.Name = value
	button.LayoutOrder = index
	button.Size = UDim2.fromOffset(filter.width, 28)
	button.BackgroundColor3 = Color3.fromRGB(35, 38, 44)
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBold
	button.Text = filter.label
	button.TextColor3 = Color3.fromRGB(210, 215, 222)
	button.TextSize = 10
	button.Parent = filters

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = button

	filterButtons[value] = button

	button.MouseButton1Click:Connect(function()
		selectedType = value
		updateFilterButtons()
		renderList()
	end)
end

importButton.MouseButton1Click:Connect(importLocalFiles)
searchBox:GetPropertyChangedSignal("Text"):Connect(renderList)
listLayout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
	list.CanvasSize = UDim2.fromOffset(0, listLayout.AbsoluteContentSize.Y + 8)
end)

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

for _, descendant in ipairs(game:GetDescendants()) do
	watchScript(descendant)
end

game.DescendantAdded:Connect(watchScript)
game.DescendantRemoving:Connect(unwatchScript)
ReplicatedStorage.DescendantAdded:Connect(scheduleManifestReload)
ReplicatedStorage.DescendantRemoving:Connect(scheduleManifestReload)

updateFilterButtons()
reloadManifest()
`;

module.exports = {
	buildStudioPluginManifest,
	defaultStudioPluginOutputPath,
	generateManifestModule,
	generateStudioPlugin,
	generateStudioPluginRbxm,
	generateStudioPluginRbxmx,
	luaLongString,
	resolveManifestOutputPath,
	resolveStudioPluginOutputPath,
	robloxStudioPluginsDir,
	writeStudioManifest,
	writeStudioPlugin,
};
