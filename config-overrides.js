// config-overrides.js
module.exports = function override(config) {
  // Ignorer les warnings de html5-qrcode
  config.ignoreWarnings = [
    {
      module: /node_modules\/html5-qrcode/,
    },
  ];

  // Optionnel : Exclure node_modules du source-map-loader
  const sourceMapLoaderRule = config.module.rules.find(
    (rule) => rule.loader && rule.loader.includes('source-map-loader')
  );

  if (sourceMapLoaderRule) {
    sourceMapLoaderRule.exclude = /node_modules/;
  }

  return config;
};