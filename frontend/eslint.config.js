// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ['src/app/index.jsx'],
    rules: {
      // These props belong to the Three.js renderer, rather than DOM elements.
      'react/no-unknown-property': ['warn', {
        ignore: ['position', 'args', 'uniforms', 'vertexShader', 'fragmentShader',
          'transparent', 'depthWrite', 'toneMapped', 'emissive',
          'emissiveIntensity', 'roughness', 'intensity'],
      }],
    },
  },
]);
