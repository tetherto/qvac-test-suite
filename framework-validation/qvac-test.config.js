// Test config for Step 1 validation
export default {
  brokerUrl: 'mqtt://localhost:1883',
  testDir: './tests',
  consumers: {
    desktop: {
      platforms: ['macos'],
      entry: './tests/desktop/executor.js',
      include: ['./tests/**'],
      dependencies: 'auto',
    },
  },
};
