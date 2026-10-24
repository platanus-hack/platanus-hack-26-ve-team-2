// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Modelos 3D para Viro
config.resolver.assetExts.push("glb", "gltf");

module.exports = config;
