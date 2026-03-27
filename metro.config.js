const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude .local directory (temp/skill files) to prevent Metro watcher crashes
config.resolver = config.resolver || {};
config.resolver.blockList = [
  /\/\.local\/.*/,
  /\/\.local$/,
];

module.exports = config;
