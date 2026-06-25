import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { config as loadDotenv } from 'dotenv'
import { loadConfig } from '../../utils/config-loader.js'
import { generateMobileEnvFile } from '../../utils/mobile-env-baker.js'
import type { QvacTestConfig } from '../../types/config.js'

function detectTeamIdFromKeychain(): string | undefined {
  if (process.platform !== 'darwin') return undefined
  try {
    const subject = execSync(
      'security find-certificate -a -c "Apple Development" -p | openssl x509 -subject -noout',
      {
        encoding: 'utf-8',
        timeout: 10000
      }
    )
    const match = subject.match(/OU=([A-Z0-9]{10,})/)
    return match?.[1]
  } catch {}
  try {
    const subject = execSync(
      'security find-certificate -a -c "iPhone Developer" -p | openssl x509 -subject -noout',
      {
        encoding: 'utf-8',
        timeout: 10000
      }
    )
    const match = subject.match(/OU=([A-Z0-9]{10,})/)
    return match?.[1]
  } catch {}
  return undefined
}

export interface MobileBuildOptions {
  platform: 'ios' | 'android'
  config: string
  runId?: string
  mqttBroker?: string
  /** Stop after prebuild (copy templates, generate config, npm install, expo prebuild). Skip native build. */
  prepareOnly?: boolean
}

function resolveConfigValue(value: unknown): unknown {
  if (!value) return undefined
  if (typeof value === 'object' && value !== null && 'env' in value) {
    const envVar = (value as { env: string }).env
    return process.env[envVar]
  }
  return value
}

function generateMobileConfigFile(
  config: QvacTestConfig,
  runId: string,
  outputDir: string,
  configDir: string
): string | undefined {
  const mqttConfig: any = config.mqtt || {}

  // Resolve broker config
  const broker = mqttConfig.broker || {}
  const protocol = resolveConfigValue(broker.protocol) || 'ws'
  const host = resolveConfigValue(broker.host) || 'localhost'
  const port = resolveConfigValue(broker.port) || '8080'
  const mqttPath = resolveConfigValue(broker.path) || '/mqtt'

  // Resolve auth config
  const username = resolveConfigValue(mqttConfig.username)
  const password = resolveConfigValue(mqttConfig.password)

  // Resolve TLS config
  const rejectUnauthorized = mqttConfig.rejectUnauthorized ?? true

  // Read and inline CA certificate if specified
  let caCert: string | undefined
  const caPath = resolveConfigValue(mqttConfig.caPath)
  if (caPath && typeof caPath === 'string') {
    const resolvedCaPath = path.isAbsolute(caPath) ? caPath : path.resolve(configDir, caPath)
    if (fs.existsSync(resolvedCaPath)) {
      caCert = fs.readFileSync(resolvedCaPath, 'utf-8')
      console.log(`   ✅ Inlined CA certificate from ${caPath} (${caCert.length} bytes)`)
    } else {
      console.warn(`   ⚠️  CA certificate not found at ${resolvedCaPath}, skipping`)
    }
  }

  const configContent = `// Auto-generated config for mobile consumer
// This file is generated at build time and should not be edited manually

export interface MobileConsumerConfig {
  mqtt: {
    protocol: string;
    host: string;
    port: string;
    path: string;
    username?: string;
    password?: string;
    ca?: string;
    rejectUnauthorized: boolean;
  };
  runId: string;
}

export const config: MobileConsumerConfig = {
  mqtt: {
    protocol: ${JSON.stringify(protocol)},
    host: ${JSON.stringify(host)},
    port: ${JSON.stringify(port)},
    path: ${JSON.stringify(mqttPath)},
    username: ${JSON.stringify(username)},
    password: ${JSON.stringify(password)},
    ca: ${JSON.stringify(caCert)},
    rejectUnauthorized: ${rejectUnauthorized},
  },
  runId: ${JSON.stringify(runId)},
};
`

  fs.writeFileSync(path.join(outputDir, 'consumer-config.ts'), configContent)
  console.log(`   ✅ Generated consumer-config.ts`)

  // Return CA cert for use in Android network security config
  return caCert
}

export async function buildConsumerMobile(options: MobileBuildOptions) {
  try {
    console.log(`🔨 Building mobile consumer for ${options.platform}\n`)

    // Load configuration
    const configDir = path.resolve(options.config)

    // Load .env file from config directory
    loadDotenv({ path: path.join(configDir, '.env') })

    const config = await loadConfig(configDir)

    if (!config.consumers?.mobile) {
      throw new Error('No mobile consumer configuration found in qvac-test.config.js')
    }

    const mobileConfig = config.consumers.mobile
    const runId = options.runId || `mobile-${Date.now()}`

    // Resolve paths
    const entryPath = path.resolve(configDir, mobileConfig.entry)
    const outputDir = path.resolve(configDir, 'build/consumers', options.platform)
    const templateDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../templates/mobile-consumer'
    )

    console.log(`📂 Entry point: ${mobileConfig.entry}`)
    console.log(`📦 Output directory: ${outputDir}\n`)

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true })

    // Clean generated files to ensure fresh config from current env
    const generatedFiles = ['consumer-config.ts', 'app.json', 'executor.js', 'assets.ts']
    for (const file of generatedFiles) {
      const filePath = path.join(outputDir, file)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    // Copy template files
    console.log('📋 Copying template files...')
    copyTemplateFiles(
      templateDir,
      outputDir,
      mobileConfig.mobileInit,
      mobileConfig.metroConfig,
      configDir
    )

    // Validate MQTT protocol for mobile (only ws/wss supported)
    if (config.mqtt?.broker?.protocol) {
      const protocol =
        typeof config.mqtt.broker.protocol === 'object' && 'env' in config.mqtt.broker.protocol
          ? process.env[config.mqtt.broker.protocol.env] || ''
          : config.mqtt.broker.protocol

      if (protocol && protocol !== 'ws' && protocol !== 'wss') {
        throw new Error(
          `Mobile consumers only support ws/wss protocols, got: ${protocol}. MQTT/MQTTS are not supported by React Native.`
        )
      }
    }

    // Generate config.ts file with baked config
    console.log('⚙️  Generating config file...')
    const caCertForAndroid = generateMobileConfigFile(config, runId, outputDir, configDir)
    console.log(`   Run ID: ${runId}`)

    // Generate asset declarations if assets are configured
    if (mobileConfig.assets?.patterns && mobileConfig.assets.patterns.length > 0) {
      console.log('🎨 Generating asset declarations...')
      await generateAssetDeclarations(configDir, outputDir, mobileConfig.assets.patterns)
    }

    // Bundle user's executor (include shared code if configured)
    console.log('📦 Bundling executor...')
    const allIncludes = [...mobileConfig.include, ...(config.consumers?.shared?.include ?? [])]
    await bundleExecutor(entryPath, outputDir, configDir, allIncludes, config)

    // Generate package.json with dependencies
    console.log('📦 Setting up dependencies...')
    await generatePackageJson(configDir, outputDir, mobileConfig.dependencies)

    // Generate app.json with config
    console.log('⚙️  Configuring app.json...')
    generateAppJson(outputDir, options.platform, mobileConfig.expoPlugins, caCertForAndroid)

    // Install dependencies.
    // Use --install-links so file: deps (e.g. monorepo SDKs referenced via
    // file:..) are packed-and-copied instead of symlinked. Symlinking exposes
    // the linked package's own node_modules to Metro / Expo autolinking, which
    // can pull in transitive duplicates of react-native and friends.
    // Also persist install-links=true into .npmrc so manual reruns and nested
    // npm invocations (e.g. expo prebuild postinstall paths) inherit it.
    // CRITICAL: merge into any existing .npmrc rather than overwriting; CI
    // pipelines may pre-populate it with scoped registry auth.
    upsertNpmrcKeys(path.join(outputDir, '.npmrc'), {
      'install-links': 'true',
      'legacy-peer-deps': 'false'
    })
    console.log('📥 Installing dependencies (with --install-links)...')
    execSync('npm install --install-links=true', { cwd: outputDir, stdio: 'inherit' })

    if (options.prepareOnly) {
      // Skip prebuild -- caller (e.g. expo run:ios) will handle prebuild + build + signing
      console.log(`\n✅ Prepared ${options.platform} consumer at: ${outputDir}`)
      return
    }

    // Run expo prebuild (--clean ensures native project reflects current config)
    console.log('\n🔧 Running expo prebuild...')
    execSync(`npx expo prebuild --clean --platform ${options.platform}`, {
      cwd: outputDir,
      stdio: 'inherit'
    })

    // Build the app
    console.log(`\n🏗️  Building ${options.platform} app...`)
    if (options.platform === 'android') {
      // Don't run gradle clean - it wipes out assets generated by expo plugins
      execSync('./gradlew assembleRelease', {
        cwd: path.join(outputDir, 'android'),
        stdio: 'inherit'
      })

      const apkPath = path.join(outputDir, 'android/app/build/outputs/apk/release/app-release.apk')

      if (fs.existsSync(apkPath)) {
        console.log(`\n✅ Build successful!`)
        console.log(`📦 APK: ${apkPath}`)

        // Copy APK to output root if configured
        if (mobileConfig.copyArtifact !== false) {
          fs.copyFileSync(apkPath, path.join(outputDir, 'consumer.apk'))
          console.log(`📋 Copied to: ${path.join(outputDir, 'consumer.apk')}`)
        }
      } else {
        throw new Error('APK file not found after build')
      }
    } else {
      // iOS build
      const iosDir = path.join(outputDir, 'ios')

      // Detect scheme from the generated Xcode project (expo prebuild already ran pod install)
      const listOutput = execSync('xcodebuild -list', { cwd: iosDir, encoding: 'utf-8' })
      const schemeMatch = listOutput.match(/Schemes:\s*\n\s*(.+)/)
      if (!schemeMatch) {
        throw new Error('Could not detect Xcode scheme from xcodebuild -list')
      }
      const scheme = schemeMatch[1].trim()
      console.log(`   Detected scheme: ${scheme}`)

      const archivePath = path.join(iosDir, 'build', `${scheme}.xcarchive`)
      const exportDir = path.join(iosDir, 'build', 'export')

      // Manual signing only when an explicit provisioning profile is provided (CI)
      const manualSigning = !!process.env.QVAC_IOS_PROVISIONING_PROFILE
      const teamId = process.env.QVAC_IOS_TEAM_ID || detectTeamIdFromKeychain()

      // Archive
      const archiveArgs = [
        'xcodebuild',
        `-workspace "${scheme}.xcworkspace"`,
        `-scheme "${scheme}"`,
        '-sdk iphoneos',
        '-configuration Release',
        '-destination "generic/platform=iOS"',
        `-archivePath "${archivePath}"`,
        '-quiet'
      ]

      if (manualSigning && teamId) {
        const identity = process.env.QVAC_IOS_CODE_SIGN_IDENTITY || 'Apple Distribution'
        const profileUuid = process.env.QVAC_IOS_PROVISIONING_PROFILE!
        archiveArgs.push(
          'CODE_SIGN_STYLE=Manual',
          `PROVISIONING_PROFILE_SPECIFIER="${profileUuid}"`,
          `CODE_SIGN_IDENTITY="${identity}"`,
          `DEVELOPMENT_TEAM="${teamId}"`
        )
        console.log('   Using manual signing (CI mode)')
      } else {
        // Team ID is injected via app.json (ios.appleTeamId) during prebuild
        archiveArgs.push('-allowProvisioningUpdates')
        console.log(`   Using automatic signing${teamId ? ` (team: ${teamId})` : ''}`)
      }

      archiveArgs.push('clean archive')
      execSync(archiveArgs.join(' '), { cwd: iosDir, stdio: 'inherit' })

      // Write ExportOptions.plist
      const bundleId = process.env.QVAC_IOS_BUNDLE_ID || 'io.tether.qvac-test-consumer-mobile'
      const exportMethod = process.env.QVAC_IOS_EXPORT_METHOD || 'development'
      const exportPlistPath = path.join(iosDir, 'build', 'ExportOptions.plist')

      let exportPlist: string
      if (manualSigning) {
        const profileUuid = process.env.QVAC_IOS_PROVISIONING_PROFILE || ''
        exportPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${exportMethod}</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundleId}</key>
    <string>${profileUuid}</string>
  </dict>
</dict>
</plist>`
      } else {
        exportPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${exportMethod}</string>${teamId ? `\n  <key>teamID</key>\n  <string>${teamId}</string>` : ''}
  <key>signingStyle</key>
  <string>automatic</string>
</dict>
</plist>`
      }

      fs.writeFileSync(exportPlistPath, exportPlist)

      // Export IPA
      fs.mkdirSync(exportDir, { recursive: true })
      execSync(
        `xcodebuild -exportArchive -archivePath "${archivePath}" -exportOptionsPlist "${exportPlistPath}" -exportPath "${exportDir}" -quiet`,
        { cwd: iosDir, stdio: 'inherit' }
      )

      // Find and copy IPA
      const exportFiles = fs.readdirSync(exportDir)
      const ipaFile = exportFiles.find((f) => f.endsWith('.ipa'))
      if (!ipaFile) {
        throw new Error(`IPA file not found in ${exportDir}`)
      }

      const ipaPath = path.join(exportDir, ipaFile)
      console.log(`\n✅ Build successful!`)
      console.log(`📦 IPA: ${ipaPath}`)

      if (mobileConfig.copyArtifact !== false) {
        fs.copyFileSync(ipaPath, path.join(outputDir, 'consumer.ipa'))
        console.log(`📋 Copied to: ${path.join(outputDir, 'consumer.ipa')}`)
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Build failed:', errorMessage)
    process.exit(1)
  }
}

function copyTemplateFiles(
  templateDir: string,
  outputDir: string,
  mobileInitPath?: string,
  metroConfigPath?: string,
  configDir?: string
): void {
  const files = [
    'App.tsx',
    'batch-consumer.tsx',
    'consumer-wrapper.tsx',
    'metro.config.js',
    'babel.config.js'
  ]

  for (const file of files) {
    // Skip metro.config.js if user provides custom one
    if (file === 'metro.config.js' && metroConfigPath) {
      continue
    }

    const src = path.join(templateDir, file)
    const dest = path.join(outputDir, file)

    if (file === 'App.tsx') {
      let content = fs.readFileSync(src, 'utf-8')

      // Handle mobileInit placeholder replacement if specified
      if (mobileInitPath) {
        const mobileInitBasename = path.basename(mobileInitPath, path.extname(mobileInitPath))
        content = content.replace(
          '// MOBILE_INIT_IMPORT_PLACEHOLDER',
          `import { __sdkPreload } from './${mobileInitBasename}';`
        )
        content = content.replace(
          '// MOBILE_INIT_REFERENCE_PLACEHOLDER',
          `if (__DEV__ && __sdkPreload) { console.log('SDK preloaded'); }`
        )
      } else {
        // Remove placeholders if no mobileInit
        content = content.replace('// MOBILE_INIT_IMPORT_PLACEHOLDER\n', '')
        content = content.replace('  // MOBILE_INIT_REFERENCE_PLACEHOLDER\n', '')
      }

      fs.writeFileSync(dest, content)
    } else {
      fs.copyFileSync(src, dest)
    }
  }

  // Copy mobileInit file if specified
  if (mobileInitPath && configDir) {
    const mobileInitSrc = path.join(configDir, mobileInitPath)
    if (fs.existsSync(mobileInitSrc)) {
      const mobileInitBasename = path.basename(mobileInitPath)
      const mobileInitDest = path.join(outputDir, mobileInitBasename)
      fs.copyFileSync(mobileInitSrc, mobileInitDest)
      console.log(`📱 Copied mobile init: ${mobileInitBasename}`)
    } else {
      console.warn(`⚠️  Mobile init file not found: ${mobileInitPath}`)
    }
  }

  // Copy custom Metro config if specified
  if (metroConfigPath && configDir) {
    const metroConfigSrc = path.join(configDir, metroConfigPath)
    if (fs.existsSync(metroConfigSrc)) {
      const metroConfigDest = path.join(outputDir, 'metro.config.js')
      fs.copyFileSync(metroConfigSrc, metroConfigDest)
      console.log(`⚙️  Copied custom Metro config: ${metroConfigPath}`)
    } else {
      console.warn(`⚠️  Metro config file not found: ${metroConfigPath}`)
    }
  }

  // Copy plugins directory
  const pluginsDir = path.join(templateDir, 'plugins')
  const destPluginsDir = path.join(outputDir, 'plugins')
  if (fs.existsSync(pluginsDir)) {
    fs.mkdirSync(destPluginsDir, { recursive: true })
    const pluginFiles = fs.readdirSync(pluginsDir)
    for (const pluginFile of pluginFiles) {
      fs.copyFileSync(path.join(pluginsDir, pluginFile), path.join(destPluginsDir, pluginFile))
    }
  }
}

// lunte-disable-next-line require-await
async function bundleExecutor(
  entryPath: string,
  outputDir: string,
  configDir: string,
  includePatterns: string[],
  config: QvacTestConfig
): Promise<void> {
  // Copy all test files that the executor depends on
  for (const pattern of includePatterns) {
    // Simple pattern handling: ./tests/** means copy tests directory
    const cleanPattern = pattern.replace(/\/\*\*.*$/, '')
    const srcDir = path.join(configDir, cleanPattern)

    if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
      const destDir = path.join(outputDir, cleanPattern)
      copyDirectoryRecursive(srcDir, destDir)
    }
  }

  // Create executor.js that re-exports all from the copied entry file
  const relativeEntry = path.relative(configDir, entryPath)
  const executorContent = `// Bundled executor entry point
export * from './${relativeEntry.replace(/\.ts$/, '')}';
`
  fs.writeFileSync(path.join(outputDir, 'executor.js'), executorContent)

  // Create test-definitions.js that re-exports from the test definitions file
  const testDir = path.resolve(configDir, config.testDir)
  const tsDefsPath = path.join(testDir, 'test-definitions.ts')
  const jsDefsPath = path.join(testDir, 'test-definitions.js')
  const defsPath = fs.existsSync(jsDefsPath)
    ? jsDefsPath
    : fs.existsSync(tsDefsPath)
      ? tsDefsPath
      : null

  if (defsPath) {
    const relativeDefs = path.relative(configDir, defsPath)
    const testDefsContent = `// Bundled test definitions entry point
export { tests, default } from './${relativeDefs.replace(/\.ts$/, '')}';
`
    fs.writeFileSync(path.join(outputDir, 'test-definitions.js'), testDefsContent)
    console.log(`   ✅ Generated test-definitions.js`)
  } else {
    console.warn(
      `   ⚠️  No test-definitions.ts/.js found in ${testDir} — consumer will not have local test definitions`
    )
  }
}

/**
 * Idempotently set keys in an .npmrc file.
 * - If the file does not exist, creates it with just the given keys.
 * - If a key already exists (uncommented), its value is replaced.
 * - If a key is missing, it is appended.
 * - Preserves all unrelated lines, comments, ordering, and trailing newline.
 *
 * Note: only handles plain `key=value` lines. Section-scoped keys
 * (e.g. `@scope:registry=...`) are matched literally as-is.
 */
function upsertNpmrcKeys(npmrcPath: string, keys: Record<string, string>): void {
  const content = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : ''
  const hadTrailingNewline = content.endsWith('\n')
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n')

  for (const [key, value] of Object.entries(keys)) {
    // Match `key = value` / `key=value`, allowing leading whitespace; ignore commented (#) lines.
    const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*=`)
    const idx = lines.findIndex((l) => !l.trimStart().startsWith('#') && re.test(l))
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`
    } else {
      lines.push(`${key}=${value}`)
    }
  }

  fs.writeFileSync(
    npmrcPath,
    lines.join('\n') + (hadTrailingNewline || lines.length > 0 ? '\n' : '')
  )
}

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// lunte-disable-next-line require-await
async function generatePackageJson(
  configDir: string,
  outputDir: string,
  dependencies: 'auto' | Record<string, string> | undefined
): Promise<void> {
  // Read template
  const templatePath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../../templates/mobile-consumer/package.json.template'
  )
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'))

  // Add user dependencies
  if (dependencies === 'auto') {
    const userPkgPath = path.join(configDir, 'package.json')
    if (fs.existsSync(userPkgPath)) {
      const userPkg = JSON.parse(fs.readFileSync(userPkgPath, 'utf-8'))
      const userDeps = userPkg.dependencies || {}

      // Adjust file: paths to be relative to output directory
      const adjustedDeps: Record<string, string> = {}
      for (const [name, version] of Object.entries(userDeps)) {
        if (typeof version === 'string' && version.startsWith('file:')) {
          const relativePath = version.replace('file:', '')
          const absolutePath = path.resolve(configDir, relativePath)
          const relativeFromOutput = path.relative(outputDir, absolutePath)
          const normalizedPath = relativeFromOutput.split(path.sep).join('/')
          adjustedDeps[name] = `file:${normalizedPath}`
        } else {
          adjustedDeps[name] = version as string
        }
      }

      template.dependencies = {
        ...template.dependencies,
        ...adjustedDeps
      }
    }
  } else if (dependencies) {
    template.dependencies = {
      ...template.dependencies,
      ...dependencies
    }
  }

  // Pin RN-stack versions across the entire dependency graph via npm overrides.
  // Without this, transitive peer ranges like react-native-bare-kit's
  // `react-native: *` can pull in a different react-native at install time.
  const pinned = ['react', 'react-native', 'react-native-bare-kit']
  const overrides: Record<string, string> = { ...(template.overrides ?? {}) }
  for (const name of pinned) {
    const v = template.dependencies?.[name]
    if (typeof v === 'string' && v.length > 0) {
      overrides[name] = v
    }
  }
  if (Object.keys(overrides).length > 0) {
    template.overrides = overrides
  }

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(template, null, 2))
}

function generateAppJson(
  outputDir: string,
  platform: string,
  userPlugins?: Array<string | [string, unknown]>,
  caCert?: string
): void {
  const templatePath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../../templates/mobile-consumer/app.json.template'
  )

  const appConfig = JSON.parse(fs.readFileSync(templatePath, 'utf-8'))

  appConfig.expo.name = process.env.QVAC_APP_NAME || 'QVAC Test Consumer'
  appConfig.expo.slug = process.env.QVAC_APP_SLUG || 'qvac-test-consumer-mobile'
  appConfig.expo.ios.bundleIdentifier =
    process.env.QVAC_IOS_BUNDLE_ID || 'io.tether.qvac-test-consumer-mobile'
  appConfig.expo.android.package =
    process.env.QVAC_ANDROID_PACKAGE || 'io.tether.qvac_test_consumer_mobile'

  const iosTeamId = process.env.QVAC_IOS_TEAM_ID || detectTeamIdFromKeychain()
  if (iosTeamId) {
    appConfig.expo.ios.appleTeamId = iosTeamId
  }

  // Update withNetworkSecurityConfig plugin to include CA cert if provided
  const networkSecurityPluginIndex = appConfig.expo.plugins.findIndex(
    (p: string | [string, unknown]) =>
      typeof p === 'string' && p.includes('withNetworkSecurityConfig')
  )

  if (networkSecurityPluginIndex !== -1 && caCert) {
    // Replace string plugin reference with array [plugin, caCert]
    appConfig.expo.plugins[networkSecurityPluginIndex] = [
      './plugins/withNetworkSecurityConfig.js',
      caCert
    ]
    console.log(`   ✅ Configured network security with custom CA certificate`)
  }

  // Add user-specified expo plugins if provided
  // Insert them BEFORE expo-asset to ensure they run early in the pipeline
  if (userPlugins && userPlugins.length > 0) {
    const assetPluginIndex = appConfig.expo.plugins.findIndex(
      (p: string | [string, unknown]) => p === 'expo-asset'
    )
    if (assetPluginIndex !== -1) {
      appConfig.expo.plugins.splice(assetPluginIndex, 0, ...userPlugins)
    } else {
      appConfig.expo.plugins.push(...userPlugins)
    }
  }

  fs.writeFileSync(path.join(outputDir, 'app.json'), JSON.stringify(appConfig, null, 2))
}

// lunte-disable-next-line require-await
async function generateAssetDeclarations(
  configDir: string,
  outputDir: string,
  assetPatterns: string[]
): Promise<void> {
  const assetsByCategory: Record<string, Record<string, string>> = {}

  // Copy assets into build directory and track them
  function copyAssets(sourceDir: string, category: string, destCategoryDir: string) {
    if (!fs.existsSync(sourceDir)) {
      return
    }

    fs.mkdirSync(destCategoryDir, { recursive: true })

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name)
      if (entry.isDirectory()) {
        const subDestDir = path.join(destCategoryDir, entry.name)
        copyAssets(sourcePath, category, subDestDir)
      } else if (entry.isFile()) {
        const destPath = path.join(destCategoryDir, entry.name)
        fs.copyFileSync(sourcePath, destPath)

        if (!assetsByCategory[category]) {
          assetsByCategory[category] = {}
        }
        // Store relative path from output root
        const relativePath = path.relative(outputDir, destPath)
        assetsByCategory[category][entry.name] = relativePath
      }
    }
  }

  // Process each pattern
  for (const pattern of assetPatterns) {
    const parts = pattern.split('/').filter((p) => p && p !== '.' && p !== '**' && p !== '*')

    // Extract category (e.g., './assets/audio/**/*' → 'audio')
    const category = parts.length >= 2 ? parts[1] : 'other'
    const sourceDir = path.join(configDir, ...parts.slice(0, 2))
    const destCategoryDir = path.join(outputDir, 'assets', category)

    copyAssets(sourceDir, category, destCategoryDir)
  }

  // Generate TypeScript file with asset exports
  const lines = [
    '// Auto-generated asset declarations - DO NOT EDIT',
    '// Generated during mobile consumer build',
    ''
  ]

  for (const [category, files] of Object.entries(assetsByCategory)) {
    lines.push(`export const ${category} = {`)
    for (const [filename, relativePath] of Object.entries(files)) {
      lines.push(`  '${filename}': require('./${relativePath.replace(/\\/g, '/')}'),`)
    }
    lines.push('};')
    lines.push('')
  }

  if (Object.keys(assetsByCategory).length === 0) {
    lines.push('// No assets found')
  }

  // Write to assets.ts in output directory
  const assetsFilePath = path.join(outputDir, 'assets.ts')
  fs.writeFileSync(assetsFilePath, lines.join('\n'))

  console.log(`   Generated assets.ts with ${Object.keys(assetsByCategory).length} categories`)
  for (const [category, files] of Object.entries(assetsByCategory)) {
    console.log(`     - ${category}: ${Object.keys(files).length} files`)
  }
}
