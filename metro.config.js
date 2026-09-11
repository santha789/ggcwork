// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Jaga konsumsi RAM saat bundling di lingkungan terbatas (Termux/Android):
// terlalu banyak worker -> jest-worker "Call retries were exceeded".
if (typeof config.maxWorkers === 'undefined' || config.maxWorkers > 2) {
  config.maxWorkers = 2;
}
config.transformer.workerCount = 2;

module.exports = config;