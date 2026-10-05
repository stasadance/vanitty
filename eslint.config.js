import eslintJavaScriptPlugin from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importPlugin from "eslint-plugin-import-x";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
    eslintJavaScriptPlugin.configs.recommended,
    ...typescriptEslint.configs.recommended,
    reactPlugin.configs.flat.recommended,
    reactPlugin.configs.flat["jsx-runtime"],
    // Rules of hooks + the React Compiler's assumptions.
    reactHooks.configs.flat.recommended,
    eslintPluginUnicorn.configs.recommended,
    importPlugin.flatConfigs.recommended,
    {
        ignores: ["**/dist/**", "public/**", "website/**", "src-tauri/**"],
    },
    {
        files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        settings: {
            // "detect" crashes eslint-plugin-react on ESLint 10.
            react: { version: "19.3" },
            "import-x/parsers": {
                "@typescript-eslint/parser": [".ts", ".tsx"],
            },
            "import-x/resolver-next": [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    noWarnOnMultipleProjects: true,
                    project: ["tsconfig.json", "tsconfig.node.json"],
                }),
            ],
        },
    },
    {
        rules: {
            // Naming a field just to leave it out of `...rest` is the point.
            "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
            "react/no-unknown-property": "off",
            "import-x/no-named-as-default": "off",
            "import-x/no-named-as-default-member": "off",
            // tsc already checks this, and it misfires on the CJS xterm addons.
            "import-x/named": "off",
            "import-x/order": [
                "error",
                {
                    groups: [
                        "builtin",
                        "external",
                        "internal",
                        "index",
                        "sibling",
                        "parent",
                        "type",
                    ],
                    pathGroups: [
                        {
                            pattern: "react",
                            group: "builtin",
                            position: "before",
                        },
                    ],
                    pathGroupsExcludedImportTypes: ["builtin"],
                    "newlines-between": "always",
                    alphabetize: { order: "asc", caseInsensitive: true },
                },
            ],
            "sort-imports": ["error", { ignoreCase: true, ignoreDeclarationSort: true }],
            "unicorn/filename-case": ["error", { case: "kebabCase" }],
            "no-nested-ternary": "error",
            "unicorn/prefer-global-this": "off",
            "unicorn/number-literal-case": "off",
            "unicorn/no-useless-undefined": "off",
            "unicorn/no-array-sort": "off",
            // React refs and the xterm/DOM APIs use null.
            "unicorn/no-null": "off",
            // These two turn every /** doc */ comment into a bare block.
            "unicorn/no-asterisk-prefix-in-documentation-comments": "off",
            "unicorn/single-line-block-comment-style": "off",
            // Module-level state (timers, caches, ids) is deliberate.
            "unicorn/no-top-level-assignment-in-function": "off",
            // `.catch()` on a promise we don't wait for is fire-and-forget,
            // not a missing await.
            "unicorn/prefer-await": "off",
            // Flags settings keys and plugin API names we can't rename, and
            // functions that return booleans.
            "unicorn/consistent-boolean-name": "off",
            // Misfires on reading typed Record values like `flags[key]`.
            "unicorn/no-computed-property-existence-check": "off",
            // Reordering class members is churn with no payoff.
            "unicorn/consistent-class-member-order": "off",
            // Vite only bundles workers written as new URL("./worker.ts", ...).
            "unicorn/relative-url-style": "off",
            "react/function-component-definition": [
                "error",
                {
                    namedComponents: "arrow-function",
                    unnamedComponents: "arrow-function",
                },
            ],
            "import-x/no-default-export": "error",
        },
    },
    {
        files: ["*.config.{js,ts}"],
        rules: {
            "import-x/no-default-export": "off",
            "unicorn/no-top-level-side-effects": "off",
        },
    },
    // Plugins load as CommonJS in the sandbox.
    {
        files: ["examples/plugins/**/*.js"],
        rules: { "unicorn/prefer-module": "off" },
    },
];
