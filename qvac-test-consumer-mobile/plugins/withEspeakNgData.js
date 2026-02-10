const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Custom Expo config plugin to bundle espeak-ng-data with the mobile app
 * 
 * This plugin copies espeak-ng-data files to:
 * - Android: android/app/src/main/assets/espeak-ng-data/
 * - iOS: ios/<AppName>/espeak-ng-data/ (added to bundle resources)
 * 
 * At runtime, the mobile consumer should copy these from assets to
 * the app's document directory for use by the TTS engine.
 */

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const withEspeakNgDataAndroid = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      
      // Source: shared-test-data/espeak-ng-data (relative to project root)
      const srcDir = path.join(projectRoot, "..", "shared-test-data", "espeak-ng-data");
      
      // Destination: android/app/src/main/assets/espeak-ng-data
      const destDir = path.join(platformRoot, "app", "src", "main", "assets", "espeak-ng-data");
      
      if (fs.existsSync(srcDir)) {
        console.log(`[withEspeakNgData] Copying espeak-ng-data to Android assets...`);
        console.log(`  Source: ${srcDir}`);
        console.log(`  Destination: ${destDir}`);
        
        copyDirSync(srcDir, destDir);
        
        // Count files and collect relative paths for runtime manifest
        const collectFiles = (dir, basePath = "") => {
          const files = [];
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              files.push(...collectFiles(path.join(dir, entry.name), relPath));
            } else {
              files.push(relPath);
            }
          }
          return files;
        };
        
        const fileList = collectFiles(destDir);
        console.log(`  Copied ${fileList.length} files`);
        
        // Write manifest so runtime code knows which files to copy from assets to files dir
        const manifestPath = path.join(destDir, "_manifest.json");
        fs.writeFileSync(manifestPath, JSON.stringify(fileList, null, 2));
        console.log(`  Generated manifest with ${fileList.length} entries`);
      } else {
        console.warn(`[withEspeakNgData] WARNING: espeak-ng-data not found at ${srcDir}`);
        console.warn(`  TTS tests will fail without espeak-ng-data`);
      }
      
      return config;
    },
  ]);
};

const withEspeakNgDataIOS = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      
      // Source: shared-test-data/espeak-ng-data (relative to project root)
      const srcDir = path.join(projectRoot, "..", "shared-test-data", "espeak-ng-data");
      
      // For iOS, we copy to the iOS project directory
      // The files will be included in the app bundle
      const appName = config.modRequest.projectName || "QVACTestConsumerMobile";
      const destDir = path.join(platformRoot, appName, "espeak-ng-data");
      
      if (fs.existsSync(srcDir)) {
        console.log(`[withEspeakNgData] Copying espeak-ng-data to iOS bundle...`);
        console.log(`  Source: ${srcDir}`);
        console.log(`  Destination: ${destDir}`);
        
        copyDirSync(srcDir, destDir);
        
        // Generate manifest for runtime copying (same as Android)
        const collectFiles = (dir, basePath = "") => {
          const files = [];
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              files.push(...collectFiles(path.join(dir, entry.name), relPath));
            } else {
              files.push(relPath);
            }
          }
          return files;
        };
        
        const fileList = collectFiles(destDir);
        const manifestPath = path.join(destDir, "_manifest.json");
        fs.writeFileSync(manifestPath, JSON.stringify(fileList, null, 2));
        console.log(`  Copied ${fileList.length} files`);
        console.log(`  Generated manifest with ${fileList.length} entries`);
      } else {
        console.warn(`[withEspeakNgData] WARNING: espeak-ng-data not found at ${srcDir}`);
      }
      
      return config;
    },
  ]);
};

/**
 * Main plugin export - applies both Android and iOS modifications
 */
const withEspeakNgData = (config) => {
  config = withEspeakNgDataAndroid(config);
  config = withEspeakNgDataIOS(config);
  return config;
};

module.exports = withEspeakNgData;
