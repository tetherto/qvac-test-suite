const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push(
  'txt',
  'py',
  'html',
  'json',  // Treat as asset data
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'wma'
);

// Watch parent directory to access shared-test-data
config.watchFolders = [
  path.resolve(__dirname, '..'), // (qvac-sdk-tests)
];

module.exports = config;
