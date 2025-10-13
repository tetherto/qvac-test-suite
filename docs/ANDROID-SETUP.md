# Running QVAC Test Consumer on Android

## Prerequisites

1. **Android Device:**
   - Android phone connected via USB with USB debugging enabled
   - OR Android emulator running

2. **Development Environment:**
   - Node.js/Bun installed ✅ (you have this)
   - Android Studio installed (for Android SDK)
   - Java Development Kit (JDK) 17 or newer

## Step 1: Enable USB Debugging on Your Phone

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go back to **Settings** → **Developer Options**
4. Enable **USB Debugging**
5. Connect phone to computer via USB
6. Allow USB debugging when prompted on phone

## Step 2: Verify Android Device Connection

```powershell
# Check if device is connected
cd qvac-test-consumer-mobile
npx expo run:android --device
```

This will list available devices. You should see your phone listed.

## Step 3: Configure MQTT Connection

**Important:** Your phone needs to connect to your computer's MQTT broker.

### Option A: Same Wi-Fi Network (Recommended)

1. **Get your computer's local IP address:**
```powershell
# Run this on your Windows machine
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Example: 192.168.1.100
```

2. **Update mobile consumer environment:**

Edit `qvac-test-consumer-mobile/env.ts`:
```typescript
EXPO_PUBLIC_MQTT_SSL: "false",
EXPO_PUBLIC_MQTT_HOST: "192.168.1.100",  // ← Your computer's IP
EXPO_PUBLIC_MQTT_PORT: 8080,              // ← WebSocket port
EXPO_PUBLIC_MQTT_PATH: "",
EXPO_PUBLIC_MQTT_TOPICS: "qvac/test",
```

3. **Configure Mosquitto for WebSocket (if not already done):**

Your MQTT broker needs WebSocket support for mobile. Edit Mosquitto config:
- Windows: `C:\Program Files\mosquitto\mosquitto.conf`
- Or wherever you installed Mosquitto

Add these lines:
```conf
listener 1883
protocol mqtt

listener 8080
protocol websockets
```

Restart Mosquitto:
```powershell
# If running as service
Restart-Service mosquitto

# Or kill and restart manually
Stop-Process -Name mosquitto -Force
& "C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Program Files\mosquitto\mosquitto.conf" -v
```

### Option B: Using ngrok (If not on same network)

If your phone isn't on the same Wi-Fi:

1. **Install ngrok:** https://ngrok.com/download

2. **Expose MQTT WebSocket port:**
```powershell
ngrok tcp 8080
```

3. **Copy the forwarding address** (e.g., `0.tcp.ngrok.io:12345`)

4. **Update env.ts:**
```typescript
EXPO_PUBLIC_MQTT_HOST: "0.tcp.ngrok.io",
EXPO_PUBLIC_MQTT_PORT: 12345,
```

## Step 4: Build and Run on Android

```powershell
cd qvac-test-consumer-mobile

# First time: Install dependencies
bun install

# Build and run on connected device
bun run android

# OR if you want to specify device
npx expo run:android --device
```

**Note:** First build takes 5-15 minutes as it compiles everything.

## Step 5: Start the Test System

Once the app is running on your phone:

**Terminal 1 - Producer:**
```powershell
cd qvac-test-producer
bun run index.ts
```

**Terminal 2 - Watch logs (optional):**
```powershell
cd qvac-test-consumer-mobile
npx expo start
# Then press 'j' to open debugger
```

## What You'll See

### On Your Phone:
- App loads with a Star Wars "not the UI you're looking for" image
- In the background, it's:
  - Downloading AI models (~1-2GB on first run)
  - Connecting to MQTT broker
  - Processing test messages
  - Sending results back

### On Your Computer (Producer):
- Test results coming from your phone
- Consumer ID will show: `consumer-mobile-[your device name]`
- Test outcomes and performance metrics

## Troubleshooting

### Can't find Android device?
```powershell
# Check ADB connection
adb devices

# If not found, make sure USB debugging is enabled
# Try different USB cable (some are charge-only)
```

### Build fails?
```powershell
# Clean and rebuild
cd qvac-test-consumer-mobile/android
./gradlew clean
cd ..
bun run android
```

### Can't connect to MQTT?
1. Check firewall allows port 8080
2. Verify your computer's IP is correct
3. Make sure phone and computer are on same Wi-Fi
4. Test MQTT broker: `Test-NetConnection YOUR_IP -Port 8080`

### App crashes on launch?
- Check Metro bundler logs
- Check Android logcat: `adb logcat *:E`
- Ensure all dependencies are installed

## Alternative: Using Expo Go (Quick Test)

For faster testing without full build:

```powershell
cd qvac-test-consumer-mobile
npx expo start

# Scan QR code with Expo Go app on phone
```

**Note:** This won't work for QVAC SDK as it requires native modules. You need a development build.

## Development Build (Recommended for Native Modules)

Since QVAC SDK uses native code:

```powershell
cd qvac-test-consumer-mobile

# Create development build
npx expo prebuild

# Install on device
bun run android
```

This creates a custom APK with all native dependencies included.

## Performance Notes

- **First run:** Expect 10-30 minutes for model downloads
- **Subsequent runs:** Fast startup, models are cached
- **Model location:** Android app documents directory
- **Network usage:** ~1-2GB download first time
- **Inference speed:** Depends on phone's CPU/GPU

## Checking Model Download Progress

While app is running, you can see logs:

```powershell
# Android logs
adb logcat | Select-String "consumer"

# Or in Metro bundler console
```

Look for:
- "Downloading model from hyperdrive..."
- "llm loaded"
- "whisper loaded"
- "connected to mqtt"

## Next Steps

Once you have it running on Android:
1. You can also run desktop consumer simultaneously
2. Both will process tests in parallel
3. Producer will show results from both consumers
4. Great for comparing performance across platforms!

