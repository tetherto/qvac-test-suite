// SDK tests configuration
export default {
  brokerUrl: 'mqtt://localhost:1883',
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
