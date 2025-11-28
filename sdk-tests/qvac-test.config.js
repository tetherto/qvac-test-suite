// SDK tests configuration
export default {
  brokerUrl: 'mqtt://localhost:1883',
  sourceRepo: '../path-to-sdk-repo', // Will need actual SDK repo path
  testDir: './tests',
  consumers: {
    desktop: {
      platforms: ['macos'],
      entry: './tests/desktop/consumer.ts',
      include: ['./tests/**'],
      dependencies: 'auto',
    },
  },
};
