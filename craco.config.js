// craco.config.js
const path = require("path");

module.exports = {
  // 1) Forcer Babel à détecter automatiquement "module" vs "script"
  //    => corrige "import/export may appear only with sourceType: module"
  babel: {
    loaderOptions: (babelLoaderOptions) => {
      babelLoaderOptions.sourceType = "unambiguous";
      return babelLoaderOptions;
    },
  },

  webpack: {
    configure: (config) => {
      // --- A) Exclure @zxing/* du source-map-loader (évite les warnings ENOENT) ---
      const smRule = config.module.rules.find(
        (r) =>
          r &&
          r.enforce === "pre" &&
          String(r.loader || "").includes("source-map-loader")
      );
      if (smRule) {
        const extraExcludes = [
          /node_modules[\/\\]@zxing[\/\\]/,
          // ajoute d'autres libs si besoin :
          // /node_modules[\/\\]some-lib-with-bad-sourcemaps[\/\\]/,
        ];
        if (Array.isArray(smRule.exclude)) {
          smRule.exclude.push(...extraExcludes);
        } else if (smRule.exclude) {
          smRule.exclude = [smRule.exclude, ...extraExcludes];
        } else {
          smRule.exclude = extraExcludes;
        }
      }

      // --- B) Ignorer des warnings spécifiques, en filet de sécurité ---
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

      // --- C) Sécurité : s'assurer que TOUS les babel-loader utilisent sourceType: 'unambiguous' ---
      const applyUnambiguousToBabelLoader = (rule) => {
        if (!rule) return;
        // cas 1: rule.loader = '.../babel-loader'
        if (rule.loader && rule.loader.includes("babel-loader")) {
          rule.options = rule.options || {};
          rule.options.sourceType = "unambiguous";
        }
        // cas 2: rule.use = [{ loader: 'babel-loader', options: {...} }, ...]
        if (Array.isArray(rule.use)) {
          rule.use.forEach((u) => {
            if (u && u.loader && u.loader.includes("babel-loader")) {
              u.options = u.options || {};
              u.options.sourceType = "unambiguous";
            }
          });
        }
      };

      // Parcourir la config CRA (oneOf)
      const oneOf = config.module.rules.find((r) => Array.isArray(r.oneOf))?.oneOf || [];
      oneOf.forEach(applyUnambiguousToBabelLoader);

      // Parcourir les autres règles au cas où
      (config.module.rules || []).forEach((r) => {
        if (!r) return;
        if (Array.isArray(r.oneOf)) r.oneOf.forEach(applyUnambiguousToBabelLoader);
        else applyUnambiguousToBabelLoader(r);
      });

      return config;
    },
  },
};
