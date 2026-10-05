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
            // Doc comments stay terse: one line when they fit, no `*` gutter.
            "unicorn/single-line-block-comment-style": ["error", "single-line"],
            // Function names say what they do (`runCommand`), not what they return.
            "unicorn/consistent-boolean-name": ["error", { checkFunctions: "never" }],
            // Vite only bundles workers written as new URL("./worker.ts", ...).
            "unicorn/relative-url-style": ["error", "always"],
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
    // Type info stops unicorn misreading value reads and non-promise thenables.
    {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
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
