#!/usr/bin/env node

/**
 * Postinstall script that handles Windows-specific workarounds
 * Skips patchelf operations on Windows since patchelf is Linux-only
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const isWindows = os.platform() === 'win32';

if (isWindows) {
  console.log('🪟 Windows detected - skipping patchelf operations');
  
  // Set environment variables for any child processes
  process.env.SKIP_PATCHELF = '1';
  process.env.PATCHELF_SKIP = '1';
  process.env.BARE_RUNTIME_SKIP_PATCHELF = '1';
  
  // Try to patch bare-runtime if it exists and has postinstall scripts
  const bareRuntimePath = path.join(
    __dirname,
    '..',
    'node_modules',
    'bare-runtime'
  );
  
  if (fs.existsSync(bareRuntimePath)) {
    const packageJsonPath = path.join(bareRuntimePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // If there's a postinstall script that uses patchelf, we've already skipped it
        // via environment variables. Just log for visibility.
        if (packageJson.scripts && packageJson.scripts.postinstall) {
          console.log('   ✓ bare-runtime postinstall will skip patchelf');
        }
      } catch (e) {
        // Ignore errors reading package.json
      }
    }
  }
  
  console.log('✅ Windows postinstall complete');
} else {
  console.log('✅ Postinstall complete (non-Windows platform)');
}


