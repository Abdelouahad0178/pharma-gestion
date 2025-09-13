// craco.config.js
const path = require("path");

module.exports = {
  webpack: {
    configure: (config) => {
      // --- 1) Exclure @zxing/* du source-map-loader (évite les warnings ENOENT) ---
      const smRule = config.module.rules.find(
        (r) => r.enforce === "pre" && String(r.loader || "").includes("source-map-loader")
      );
      if (smRule) {
        const extraExcludes = [
          /node_modules[\/\\]@zxing[\/\\]/,
          // ajoute d'autres libs si besoin :
          // /node_modules[\/\\]some-lib-with-bad-sourcemaps[\/\\]/
        ];
        if (Array.isArray(smRule.exclude)) {
          smRule.exclude.push(...extraExcludes);
        } else if (smRule.exclude) {
          smRule.exclude = [smRule.exclude, ...extraExcludes];
        } else {
          smRule.exclude = extraExcludes;
        }
      }

      // --- 2) Ignorer des warnings spécifiques, en filet de sécurité ---
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),

        // Sourcemaps cassées uniquement si ça vient de @zxing
        (warning) =>
          typeof warning?.message === "string" &&
          /Failed to parse source map/.test(warning.message) &&
          /node_modules[\/\\]@zxing/.test(warning.message),

        // “Critical dependency: Accessing import.meta directly ...”
        { message: /Critical dependency: Accessing import\.meta directly is unsupported/ },
      ];

      return config;
    },
  },
};
