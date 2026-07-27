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

export default tseslint.config(
	{
		// src/assets/livekit is vendored by scripts/copy-livekit-assets.mjs; project build output and
		// declaration files are generated, never hand-linted.
		ignores: ['src/assets/livekit/**/*', 'projects/**/dist/**/*', 'projects/**/*.d.ts']
	},
	{
		files: ['src/**/*.ts'],
		extends: [eslint.configs.recommended, tseslint.configs.recommended, angular.configs.tsRecommended, prettier],
		processor: angular.processInlineTemplates,
		rules: {
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
			],
			'@typescript-eslint/no-inferrable-types': 'warn',
			'@typescript-eslint/no-unused-vars': 'warn',
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
		}
	},
	{
		files: ['src/**/*.html'],
		ignores: ['**/*inline-template-*.component.html'],
		extends: [angular.configs.templateRecommended, prettier],
		rules: {}
	},
	// ── shared-meet-components library: storage guardrail ────────────────────────────────────────
	// The library has its own build tooling, so it is NOT put through the app ruleset above. This
	// block applies ONLY the storage guardrail to library source (parser set so TS still parses).
	{
		files: ['projects/shared-meet-components/src/**/*.ts'],
		languageOptions: {
			parser: tseslint.parser
		},
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
