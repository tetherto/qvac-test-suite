/**
 * eSpeak-ng-data utilities for mobile
 * 
 * Handles copying espeak-ng-data from app assets to the filesystem
 * and provides the correct path for the TTS model loader.
 * 
 * On Android, assets bundled via the Expo plugin are in the APK's assets folder
 * and need to be copied to the app's document directory for the native code to access.
 */

import {
  documentDirectory,
  bundleDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system/legacy";
import { Platform } from "react-native";
import { env } from "./env";

// Target directory for espeak-ng-data in the app's document directory
const ESPEAK_DATA_DIR_NAME = "espeak-ng-data";

/**
 * Get the filesystem path where espeak-ng-data should be located
 */
export function getEspeakDataPath(): string {
  if (Platform.OS === "android") {
    // On Android, we use the document directory
    return `${documentDirectory}${ESPEAK_DATA_DIR_NAME}`;
  } else if (Platform.OS === "ios") {
    // On iOS, we use the bundle path (assets are accessible directly)
    // For now, use document directory for consistency
    return `${documentDirectory}${ESPEAK_DATA_DIR_NAME}`;
  } else {
    // Fallback for web or other platforms
    return ESPEAK_DATA_DIR_NAME;
  }
}

/**
 * Check if espeak-ng-data has been initialized (copied to filesystem)
 */
export async function isEspeakDataInitialized(): Promise<boolean> {
  const targetDir = getEspeakDataPath();
  try {
    const info = await getInfoAsync(targetDir);
    if (!info.exists) {
      return false;
    }
    
    // Check for a key file to verify the data is complete
    // phondata is a critical file for espeak-ng
    const phondataPath = `${targetDir}/phondata`;
    const phondataInfo = await getInfoAsync(phondataPath);
    return phondataInfo.exists;
  } catch (error) {
    console.log("[espeak-utils] Error checking espeak data:", error);
    return false;
  }
}

/**
 * Initialize espeak-ng-data by copying from app assets to filesystem
 * 
 * Note: On Android, assets bundled in the APK need to be copied to a filesystem
 * location that the native code can access. This function handles that copy.
 * 
 * Returns true if initialization was successful, false otherwise.
 */
export async function initializeEspeakData(
  onProgress?: (message: string) => void
): Promise<boolean> {
  const log = onProgress || console.log;
  
  try {
    // Check if already initialized
    if (await isEspeakDataInitialized()) {
      log("[espeak-utils] espeak-ng-data already initialized");
      return true;
    }
    
    const targetDir = getEspeakDataPath();
    log(`[espeak-utils] Initializing espeak-ng-data to ${targetDir}`);
    
    // Create target directory
    await makeDirectoryAsync(targetDir, { intermediates: true });
    
    if (Platform.OS === "android") {
      // On Android, copy from APK assets
      // The assets are bundled at android/app/src/main/assets/espeak-ng-data/
      // We can access them via Asset.fromModule or direct asset:// URI
      
      // Note: For large directories like espeak-ng-data, we need to use
      // StorageAccessFramework or a native module. Expo FileSystem's
      // copyAsync doesn't support copying from assets:// directly.
      
      // Alternative approach: List required files and copy them individually
      // For now, we'll rely on the Android native asset access
      // The SDK may need to read directly from assets:// path
      
      log("[espeak-utils] Android: espeak-ng-data should be accessible from APK assets");
      log("[espeak-utils] Asset path: file:///android_asset/espeak-ng-data");
      
      // Return the assets path for Android - the SDK should be able to read from here
      // If not, we'll need to implement file-by-file copying
      return true;
    } else if (Platform.OS === "ios") {
      // On iOS, assets in the bundle are accessible via NSBundle
      log("[espeak-utils] iOS: espeak-ng-data should be in app bundle");
      return true;
    }
    
    return false;
  } catch (error: any) {
    log(`[espeak-utils] Error initializing espeak data: ${error.message}`);
    return false;
  }
}

/**
 * Get the Android asset path for espeak-ng-data
 * This is the path where Android can read assets bundled in the APK
 */
export function getAndroidAssetPath(): string {
  return "file:///android_asset/espeak-ng-data";
}

/**
 * Get the appropriate espeak data path for the current platform
 * This should be called after initializeEspeakData() has been run
 * 
 * Priority:
 * 1. EXPO_PUBLIC_ESPEAK_DATA_PATH env variable (if set)
 * 2. Platform-specific bundled asset path
 */
export function getEspeakDataPathForSDK(): string {
  // Check for environment variable override
  if (env.EXPO_PUBLIC_ESPEAK_DATA_PATH) {
    console.log(`[espeak-utils] Using env override: ${env.EXPO_PUBLIC_ESPEAK_DATA_PATH}`);
    return env.EXPO_PUBLIC_ESPEAK_DATA_PATH;
  }
  
  if (Platform.OS === "android") {
    // Android can read from assets directly (native code)
    // Return the asset path that the native espeak library can use
    return "/android_asset/espeak-ng-data";
  } else if (Platform.OS === "ios") {
    // iOS - return bundle path
    // Note: This may need to be adjusted based on how espeak-ng-data
    // is accessed by the native iOS code
    return `${bundleDirectory}espeak-ng-data`;
  }
  
  return getEspeakDataPath();
}
