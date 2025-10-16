# QVAC Test Consumer Mobile

A React Native/Expo mobile application for testing QVAC SDK batch consumer functionality on Android and iOS devices.

## Prerequisites

- Node.js 18+ or Bun
- Android SDK (for Android builds) or Xcode (for iOS builds)
- GitHub personal access token (for accessing private `@tetherto/qvac-sdk` package)
- Physical device or emulator

## Setup Instructions

### 1. Configure GitHub Access

Create a `.npmrc` file in the project root:

```
@tetherto:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN_HERE
```

Replace `YOUR_GITHUB_TOKEN_HERE` with your GitHub personal access token that has `read:packages` permission.

### 2. Install Dependencies

```bash
bun install
# or
npm install
```

### 3. Configure Android SDK (for Android builds)

#### On Linux/WSL:

```bash
# Install Android SDK (if not already installed)
# Download from: https://developer.android.com/studio#command-tools

# Set environment variables in ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# Install required SDK components
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006"
```

#### On Windows:

1. Install Android Studio or Android Command Line Tools
2. Set `ANDROID_HOME` environment variable to your SDK location (e.g., `C:\Users\YourName\AppData\Local\Android\Sdk`)
3. Add platform-tools to PATH: `%ANDROID_HOME%\platform-tools`

### 4. Run Expo Prebuild

This generates the native Android/iOS projects and bundles the QVAC mobile worker:

```bash
bunx expo prebuild --clean
# or
npx expo prebuild --clean
```

**Important:** On Windows, you may need to run this in WSL due to native toolchain requirements (specifically the `bare-pack` bundler).

You should see this success message:
```
🫡 QVAC: Mobile worker bundle generated successfully
```

## Running the App

### Option 1: Development Build (Recommended for Development)

1. Start the Metro bundler:

```bash
bun start
# or
npm start
```

2. Connect your Android device via USB or wireless debugging

3. In another terminal, build and install:

```bash
bun run android
# or
npm run android
```

### Option 2: Standalone APK (Recommended for Testing)

This is the most reliable way to test on physical devices.

#### On Linux/WSL:

```bash
cd android
./gradlew assembleDebug
```

#### On Windows PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

Install on device:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Device Connection Setup

### USB Debugging

1. On your Android device:
   - Go to Settings → About phone → Tap "Build number" 7 times to enable Developer Options
   - Go to Settings → Developer Options → Enable "USB debugging"
2. Connect device via USB
3. Verify connection: `adb devices`

### Wireless Debugging (Android 11+)

1. On your Android device:
   - Go to Settings → Developer Options
   - Enable "Wireless debugging"
   - Tap "Wireless debugging" → "Pair device with pairing code"
   - Note the IP:PORT and pairing code

2. On your computer:

```bash
adb pair IP:PORT
# Enter the pairing code when prompted

adb connect IP:PORT
# Use the connection IP:PORT (different from pairing port)
```

## Troubleshooting

### "SDK location not found" Error

Create `android/local.properties` file:

```
sdk.dir=/path/to/your/android-sdk
```

- For WSL: `sdk.dir=/home/username/android-sdk`
- For Windows: `sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk`

### "patchelf.exe" Errors on Windows

The `react-native-bare-kit` native module requires Linux tools to patch native libraries. Solutions:

1. **Recommended:** Run `expo prebuild` and `gradlew assembleDebug` in WSL
2. Copy project to WSL filesystem: `cp -r /mnt/c/path/to/project ~/project-mobile`

### "Cannot find module '@tetherto/qvac-sdk/worker.mobile.bundle'"

This means the mobile worker bundle wasn't generated during prebuild. Ensure:

1. You've run `expo prebuild` successfully
2. You see the success message: `🫡 QVAC: Mobile worker bundle generated successfully`
3. You're using QVAC SDK version **0.13.0 or later** (the mobile bundle generation was fixed in this version)

If prebuild fails with errors about `crypto` module or `HyperDBAdapter`, upgrade to SDK 0.13.0+:

```bash
bun add @tetherto/qvac-sdk@latest
# or
npm install @tetherto/qvac-sdk@latest
```

### Metro Bundler Connection Issues

If the app can't connect to Metro bundler:

1. Ensure Metro is running on the correct host:

```bash
# Linux/WSL - use your computer's local IP
export REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.XXX
bun start
```

```powershell
# Windows PowerShell
$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.1.XXX"
bun start
```

2. On the device, open dev menu (shake device or run `adb shell input keyevent 82`)
3. Go to Settings → Debug server host & port
4. Enter: `192.168.1.XXX:8081`

### Minimum SDK Version Conflicts

The app requires **minSdkVersion 29** (Android 10) due to QVAC SDK dependencies. This is configured in:
- `app.json` (Expo config)
- `android/app/build.gradle` (after prebuild)

If you see errors about minSdkVersion conflicts, ensure all three locations have `minSdkVersion: 29`.

### Build Failures After Dependency Updates

After updating dependencies, always run:

```bash
# Clean everything
rm -rf node_modules android ios .expo
bun install
bunx expo prebuild --clean
```

## Project Structure

- `app/` - Expo Router pages and navigation
- `batch-consumer.tsx` - Main batch consumer component
- `test-executor.ts` - Test execution logic and orchestration
- `android/` - Native Android project (generated by `expo prebuild`)
- `ios/` - Native iOS project (generated by `expo prebuild`)
- `assets/` - Test audio files and images

## Configuration

### `app.json`

Key configuration:
- `android.minSdkVersion`: 29 (Android 10+)
- `android.package`: `io.tether.qvac_test_consumer_mobile`
- Plugins: 
  - `@tetherto/qvac-sdk/expo-plugin` - Generates mobile worker bundle
  - `expo-build-properties` - Sets native build properties

### Environment Variables

Create `.env` file based on `.env.example` for any custom configuration.

## Known Issues

1. **Build on Windows:** Native modules may require WSL due to toolchain dependencies (patchelf, bare-pack, etc.)
2. **Expo SDK Version:** The app uses Expo SDK 53. Ensure consistency with Expo Go version if using development builds.
3. **QVAC SDK Version:** Use **0.13.0 or later** for proper mobile worker bundle generation. Earlier versions have a bug where the crypto module is imported in mobile context.
4. **Metro Bundler on Windows:** May have issues with web bundling. Use standalone APK for reliable testing.

## Building for Production

### Android (EAS Build)

```bash
# Build APK
bunx eas build --platform android --profile preview

# Build AAB for Play Store
bunx eas build --platform android --profile production
```

### iOS (EAS Build)

```bash
# Build for TestFlight
bunx eas build --platform ios --profile preview

# Build for App Store
bunx eas build --platform ios --profile production
```

See `eas.json` for build profiles.

## Testing

The app includes comprehensive batch consumer tests:
- Audio transcription tests
- Image vision tests
- Embed model tests  
- Text generation tests
- Multiple batch orchestration scenarios

Tests are automatically executed when the app starts. See `test-executor.ts` for test details.

## Support

For QVAC SDK issues:
- Check the internal SDK documentation
- Contact the Tether development team
- Raise issues in the SDK repository

## Contributing

When making changes:
1. Run `bun run lint` to check code style
2. Test on both physical device and emulator
3. Verify both development and production builds work
4. Update this README if adding new setup requirements


