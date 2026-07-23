// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		// projects/** has its own tooling; src/assets/livekit is vendored by scripts/copy-livekit-assets.mjs
		ignores: ['projects/**/*', 'src/assets/livekit/**/*']
	},
	{
		files: ['**/*.ts'],
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
		files: ['**/*.html'],
		ignores: ['**/*inline-template-*.component.html'],
		extends: [angular.configs.templateRecommended, prettier],
		rules: {}
	}
);
