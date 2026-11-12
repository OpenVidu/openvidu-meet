// @ts-check
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SYMBOLS_FONT = 'material-symbols-outlined';
const FRONTEND_ROOT = path.resolve(import.meta.dirname, '..');
const DECLARATIONS = 'projects/shared-meet-components/src/lib/**/icons/*-material-symbols.ts';

/** Every string literal of the declaration files, which by convention hold only the list of icon names. */
const readDeclaredSymbols = () => {
	const symbols = new Set();

	for (const file of globSync(DECLARATIONS, { cwd: FRONTEND_ROOT })) {
		const source = readFileSync(path.join(FRONTEND_ROOT, file), 'utf8');
		const collect = (/** @type {import('typescript').Node} */ node) => {
			if (ts.isStringLiteral(node)) {
				symbols.add(node.text);
			}

			ts.forEachChild(node, collect);
		};
		collect(ts.createSourceFile(file, source, ts.ScriptTarget.Latest));
	}

	return symbols;
};

/** @param {any} element */
const usesSymbolsFont = (element) =>
	element.attributes.some(
		(/** @type {any} */ { name, value }) =>
			(name === 'class' && value.split(/\s+/).includes(SYMBOLS_FONT)) ||
			(name === 'fontSet' && value === SYMBOLS_FONT)
	);

/** @param {any} node */
const isStaticText = (node) => typeof node.value === 'string' && !('name' in node);

/**
 * The icon names written literally on an element: a static `fontIcon` attribute and a text content with no
 * binding. A name computed in TypeScript is checked by the compiler instead, against its domain's type.
 * @param {any} element
 */
const literalSymbols = (element) => {
	const symbols = element.attributes
		.filter((/** @type {any} */ attribute) => attribute.name === 'fontIcon')
		.map((/** @type {any} */ attribute) => ({ name: attribute.value, span: attribute.sourceSpan }));
	const text = element.children.every(isStaticText)
		? element.children
				.map((/** @type {any} */ child) => child.value)
				.join('')
				.trim()
		: '';

	if (text) {
		symbols.push({ name: text, span: element.sourceSpan });
	}

	return symbols;
};

/** @type {import('eslint').Rule.RuleModule} */
export const declaredMaterialSymbols = {
	meta: {
		type: 'problem',
		docs: {
			description: `Every icon shown in the \`${SYMBOLS_FONT}\` font is declared, because the font only draws the declared ones`
		},
		schema: [],
		messages: {
			undeclared:
				"'{{name}}' is not a declared Material Symbol, so it shows as plain text. Add it to the icons/<domain>-material-symbols.ts of the domain that shows it."
		}
	},
	create(context) {
		const declared = readDeclaredSymbols();
		const parserServices = /** @type {any} */ (context.sourceCode.parserServices);

		return {
			Element(/** @type {any} */ element) {
				if (!usesSymbolsFont(element)) {
					return;
				}

				for (const { name, span } of literalSymbols(element)) {
					if (!declared.has(name)) {
						context.report({
							loc: parserServices.convertNodeSourceSpanToLoc(span),
							messageId: 'undeclared',
							data: { name }
						});
					}
				}
			}
		};
	}
};
