const { getDefaultConfig } = require("@expo/metro-config");
const path = require("node:path");
const fs = require("fs");

// Handle junction: resolve actual path if needed
let projectRoot = __dirname;
const realProjectRoot = fs.realpathSync(projectRoot);

const config = getDefaultConfig(realProjectRoot);

// Inject polyfills at the very beginning of the bundle
config.serializer = {
  ...config.serializer,
  createModuleIdFactory: config.serializer?.createModuleIdFactory,
  processModuleFilter: config.serializer?.processModuleFilter,
  customSerializer: config.serializer?.customSerializer,
  getModulesRunBeforeMainModule: () => [
    path.resolve(projectRoot, "polyfills.js"),
  ],
};

// let Metro follow symlinks (pnpm/yarn link, monorepo)
config.resolver.unstable_enableSymlinks = true;

// watch the workspace root to access ../shared-test-data/ files
// Use real path to handle junctions properly
config.watchFolders = [realProjectRoot, path.resolve(realProjectRoot, "..")];

// resolve modules only from the app's node_modules to avoid dupes
config.resolver.nodeModulesPaths = [path.resolve(realProjectRoot, "node_modules")];

// keep as sources (no dots)
config.resolver.sourceExts = [...config.resolver.sourceExts, "sql"];

// treat these as assets
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  "so",
  "bin",
  "model",
  "bundle",
  "txt",
  "py",
  "html",
  "onnx",
  "wav",
];

// ignore config files that should never be bundled in mobile apps
config.resolver.blockList = [
  // ESLint configs
  /.*\/eslint\.config\.(js|mjs|cjs|ts|json)$/,
  /.*\/\.eslintrc.*$/,

  // Prettier configs
  /.*\/\.prettierrc.*$/,
  /.*\/prettier\.config\.(js|mjs|cjs|ts|json)$/,

  // Other config files that shouldn't be bundled
  /.*\/\.gitignore$/,
  /.*\/\.npmrc$/,
  /.*\/tsconfig.*\.json$/,
  /.*\/jest\.config\.(js|mjs|cjs|ts|json)$/,
  /.*\/babel\.config\.(js|mjs|cjs|ts|json)$/,
  /.*\/webpack\.config\.(js|mjs|cjs|ts)$/,
  /.*\/rollup\.config\.(js|mjs|cjs|ts)$/,

  // Lock files and package manager configs
  /.*\/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock)$/,

  // Block Node.js-specific files that shouldn't be bundled in React Native
  /.*\/node-rpc-client\.js$/,
  /.*\/bare-rpc-client\.js$/,

  // Block CMake/Gradle build directories to prevent Metro watch errors
  /.*\/android\/\.cxx\/.*/,
  /.*\/android\/build\/.*/,
  /.*\/android\/app\/build\/.*/,
];

// Resolve Node.js built-ins to empty modules for React Native
const defaultResolver = config.resolver.resolveRequest;
const nodeBuiltins = ['fs', 'net', 'path', 'url', 'crypto', 'stream', 'util', 'events', 'buffer', 'child_process', 'os', 'http', 'https', 'tls', 'dns', 'zlib', 'querystring'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Handle Node.js built-in modules (both node:fs and fs formats)
  if (moduleName.startsWith('node:')) {
    const nodeModule = moduleName.replace('node:', '');
    if (nodeBuiltins.includes(nodeModule)) {
      return { type: 'empty' };
    }
  }

  // Handle plain Node.js built-in module names
  if (nodeBuiltins.includes(moduleName)) {
    return { type: 'empty' };
  }

  // Handle native modules that aren't available in React Native
  // These are provided by react-native-bare-kit at runtime
  if (moduleName === 'sodium-native') {
    // Return empty - the native bindings are provided by react-native-bare-kit
    return { type: 'empty' };
  }

  // Block react-dom on mobile platforms
  if (moduleName === 'react-dom' && platform !== 'web') {
    return { type: 'empty' };
  }

  // Block node-rpc-client and bare-rpc-client (not available in React Native)
  if (moduleName === './node-rpc-client.js' || moduleName === './node-rpc-client' || moduleName.endsWith('/node-rpc-client.js')) {
    return { type: 'empty' };
  }

  if (moduleName === './bare-rpc-client.js' || moduleName === './bare-rpc-client' || moduleName.endsWith('/bare-rpc-client.js')) {
    return { type: 'empty' };
  }

  // Use default resolution for other modules
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
