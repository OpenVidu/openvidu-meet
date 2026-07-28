// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	eslint.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// Not part of recommendedTypeChecked, so deprecated APIs (our own @deprecated JSDoc
			// included) accumulated invisibly until a dependency major removed them. Enabled after
			// clearing the zod 4 deprecations; intentional uses need an inline disable + a reason.
			'@typescript-eslint/no-deprecated': 'error',
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
	}
);
