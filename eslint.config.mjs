// Flags syntax that Espruino cannot run. Missing runtime APIs (Map, Math.trunc,
// …) are caught by tsc with noLib instead. See research/espruino-js-types.md.
import esX from "eslint-plugin-es-x";

export default [
  {
    files: ["apps/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    plugins: { "es-x": esX },
    rules: {
      "es-x/no-destructuring": "error",
      "es-x/no-spread-elements": "error",
      "es-x/no-rest-parameters": "error",
      "es-x/no-rest-spread-properties": "error",
      "es-x/no-default-parameters": "error",
      "es-x/no-optional-chaining": "error",
      "es-x/no-async-functions": "error",
      "es-x/no-async-iteration": "error",
      "es-x/no-generators": "error",
      "es-x/no-exponential-operators": "error",
      "es-x/no-logical-assignment-operators": "error",
      "es-x/no-modules": "error",
      "es-x/no-bigint": "error",
      "es-x/no-regexp-lookbehind-assertions": "error",
      "es-x/no-regexp-named-capture-groups": "error",
      "es-x/no-regexp-s-flag": "error",
      "es-x/no-regexp-u-flag": "error",
      "es-x/no-regexp-y-flag": "error",
      "no-labels": "error",
      "no-multi-str": "error",
      "no-unexpected-multiline": "error",
      "no-use-before-define": ["error", { functions: true, classes: true, variables: true }],
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[regex.pattern=/\\{\\d/]", message: "Espruino RegExp has no numeric quantifiers like x{3}." },
        { selector: "Literal[regex.pattern=/\\(\\?[=!]/]", message: "Espruino RegExp has no lookahead assertions." },
      ],
    },
  },
];
