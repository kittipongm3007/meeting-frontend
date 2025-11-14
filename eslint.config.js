import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    rules: {
      "react/react-in-jsx-scope": "off", // React 17+ ไม่ต้อง import React
      "react/prop-types": "off", // ✅ ปิดการบังคับใช้ PropTypes
      "no-unused-vars": ["warn"],
      "no-console": "off",
    },
  },
  pluginReact.configs.flat.recommended,
]);
