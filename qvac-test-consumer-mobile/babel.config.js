module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Enable import.meta polyfill for Hermes compatibility
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      // Transform using declarations for React Native compatibility
      '@babel/plugin-transform-explicit-resource-management',
    ],
  };
};
