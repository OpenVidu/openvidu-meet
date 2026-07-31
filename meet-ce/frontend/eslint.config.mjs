// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Direct `localStorage`/`sessionStorage` access is how ad-hoc storage crept back into the library
 * (ThemeService, RoomMemberContextService). Everything must persist through the single
 * `BrowserStorageService` engine, which owns the one prefix, the one serialization and the
 * availability guard.
 */
const STORAGE_GUARD_MESSAGE =
	'Do not use localStorage/sessionStorage directly in the library. Persist through BrowserStorageService (the single storage engine).';

/**
 * Unused bindings are reported, except the `_`-prefixed ones: signatures fixed by Angular (route
 * guards, event handlers) must keep their parameters, and the repo marks the ignored ones with `_`.
 */
const UNUSED_VARS_RULE = {
	'@typescript-eslint/no-unused-vars': [
		'warn',
		{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
	]
};

/**
 * Stylistic rules the repo enforces everywhere: blank lines around control flow and between class
 * methods. Kept as warnings, which `--max-warnings 0` still turns into a failing lint run.
 */
const FORMATTING_RULES = {
	'@typescript-eslint/no-inferrable-types': 'warn',
	'lines-between-class-members': [
		'warn',
		{
			enforce: [
				{
					blankLine: 'always',
					prev: 'method',
					next: 'method'
				}
			]
		}
	],
	'padding-line-between-statements': [
		'warn',
		{
			blankLine: 'always',
			prev: '*',
			next: ['if', 'for', 'while', 'switch']
		},
		{
			blankLine: 'always',
			prev: ['if', 'for', 'while', 'switch'],
			next: '*'
		},
		{ blankLine: 'always', prev: '*', next: 'block-like' },
		{ blankLine: 'always', prev: 'block-like', next: '*' }
	]
};

/**
 * Rules switched off across the whole workspace, each for a reason that will not change on its own.
 * Anything merely *inconvenient* belongs in the debt block below instead.
 */
const DELIBERATE_EXCEPTIONS = {
	// The `onSomething` output names are the public webcomponent/PRO API surface (they map to the
	// documented DOM events). Renaming them is a breaking change, so it belongs to the API v2 work,
	// not to a lint pass. 61 occurrences.
	'@angular-eslint/no-output-on-prefix': 'off',
	// Input aliases are load-bearing here: components expose a kebab-case public attribute while the
	// field name says where the value comes from (e.g. `roomIdInput` aliased to `roomId`). 8 uses.
	'@angular-eslint/no-input-rename': 'off'
};

/**
 * Existing violations that are real debt, switched off so the rest of the ruleset can be enforced
 * today instead of waiting for a big-bang cleanup. Reduce these per domain and delete the entry.
 *
 * `no-explicit-any`: 126 occurrences, ~29 of them `catch (error: any)`. The `catch` ones matter most
 * — reading fields off an untyped error is what silently broke the bulk-delete handlers — and the
 * shared `parseBulkDeleteError` helper is the pattern to replace them with.
 */
const KNOWN_DEBT = {
	'@typescript-eslint/no-explicit-any': 'off'
};

export default tseslint.config(
	{
		// src/assets/livekit is vendored by scripts/copy-livekit-assets.mjs; build output and
		// declaration files are generated, never hand-linted.
		ignores: [
			'src/assets/livekit/**/*',
			'projects/**/dist/**/*',
			'**/*.d.ts',
			'webcomponent/dist/**/*',
			'webcomponent/meet-ce/**/*',
			'webcomponent/meet-pro/**/*',
			'webcomponent/testapp/**/*',
			'test-results/**/*'
		]
	},
	// ── Every TypeScript source in the frontend: the SPA shell, the library that holds all the
	// application logic, the webcomponent shell and the Playwright suites. Previously only `src/**`
	// (the intentionally tiny shell) was covered, so the ruleset guarded ~0.3% of the code.
	{
		files: ['src/**/*.ts', 'projects/shared-meet-components/src/**/*.ts', 'webcomponent/src/**/*.ts'],
		extends: [eslint.configs.recommended, tseslint.configs.recommended, angular.configs.tsRecommended, prettier],
		processor: angular.processInlineTemplates,
		rules: {
			...FORMATTING_RULES,
			...UNUSED_VARS_RULE,
			...DELIBERATE_EXCEPTIONS,
			...KNOWN_DEBT,
			'@angular-eslint/directive-selector': [
				'warn',
				{
					type: 'attribute',
					prefix: 'app',
					style: 'camelCase'
				}
			],
			'@angular-eslint/component-selector': [
				'warn',
				{
					type: 'element',
					prefix: 'app',
					style: 'kebab-case'
				}
			]
		}
	},
	// Selector naming is not enforced on the library or the webcomponent: their selectors are the
	// published public API. Most already use the `ov` prefix, but the customization directives
	// (`directives/api/`) and the `<openvidu-meet>` element itself deliberately do not, and renaming
	// them is a breaking change that belongs to the API v2 work. 41 occurrences.
	{
		files: ['projects/shared-meet-components/src/**/*.ts', 'webcomponent/src/**/*.ts'],
		rules: {
			'@angular-eslint/directive-selector': 'off',
			'@angular-eslint/component-selector': 'off'
		}
	},
	// ── Templates (SPA + library + webcomponent) ─────────────────────────────────────────────────
	{
		files: ['src/**/*.html', 'projects/shared-meet-components/src/**/*.html', 'webcomponent/src/**/*.html'],
		ignores: ['**/*inline-template-*.component.html'],
		extends: [angular.configs.templateRecommended, prettier],
		rules: {}
	},
	// ── Test code: Playwright suites and the webcomponent's Jest specs ───────────────────────────
	// Same correctness rules, minus the Angular-specific ones (no components here).
	{
		files: ['e2e/**/*.ts', 'webcomponent/tests/**/*.ts'],
		extends: [eslint.configs.recommended, tseslint.configs.recommended, prettier],
		rules: {
			...FORMATTING_RULES,
			...UNUSED_VARS_RULE,
			...KNOWN_DEBT
		}
	},
	// ── Storage guardrail: library source ────────────────────────────────────────────────────────
	{
		files: ['projects/shared-meet-components/src/**/*.ts'],
		rules: {
			'no-restricted-globals': [
				'error',
				{ name: 'localStorage', message: STORAGE_GUARD_MESSAGE },
				{ name: 'sessionStorage', message: STORAGE_GUARD_MESSAGE }
			],
			'no-restricted-properties': [
				'error',
				{ object: 'window', property: 'localStorage', message: STORAGE_GUARD_MESSAGE },
				{ object: 'window', property: 'sessionStorage', message: STORAGE_GUARD_MESSAGE }
			]
		}
	},
	{
		// The storage engine + one-shot migration (and their specs) are the only places allowed to
		// touch the raw Web Storage APIs.
		files: [
			'projects/shared-meet-components/src/lib/shared/services/browser-storage.service.ts',
			'projects/shared-meet-components/src/lib/shared/services/browser-storage.migration.ts',
			'projects/shared-meet-components/src/lib/shared/services/browser-storage.service.spec.ts',
			'projects/shared-meet-components/src/lib/shared/services/browser-storage.migration.spec.ts'
		],
		rules: {
			'no-restricted-globals': 'off',
			'no-restricted-properties': 'off'
		}
	}
);
