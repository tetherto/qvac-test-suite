const { getDefaultConfig } = require("@expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// let Metro follow symlinks (pnpm/yarn link, monorepo)
config.resolver.unstable_enableSymlinks = true;

// watch the workspace root to access ../shared-test-data/ files
config.watchFolders = [projectRoot, path.resolve(projectRoot, "..")];

// resolve modules only from the app's node_modules to avoid dupes
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

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
];

module.exports = config;
