/**
 * Lightweight, dependency-free replacement for the `autolinker` package.
 *
 * Chat messages are plain text typed into a `<textarea>` and rendered via
 * `[innerHTML]`, so this linkifier HTML-escapes the whole message first and only
 * then injects anchor tags for the links it detects. That keeps any `<`, `&`, `"`
 * the user typed visible as literal text and makes link injection XSS-safe
 * regardless of Angular's own sanitizer.
 *
 * Detected: absolute URLs (`http(s)://`, `ftp://`), `www.`-prefixed URLs and
 * email addresses. Trailing sentence punctuation is excluded from the match.
 *
 * Compared with the previous autolinker config this intentionally drops phone,
 * `@mention`/`#hashtag` → twitter.com linking and bare-domain (no scheme/`www.`)
 * detection — autolinker defaults that are inappropriate for a meeting chat and
 * the most prone to false positives.
 *
 * @internal
 */

// One pass over the text. Alternatives are ordered so a full scheme URL wins over
// the `www.`/email sub-patterns at the same position. `[^\s<]` stops a URL at
// whitespace or a `<` (no raw HTML reaches here, but it keeps matches bounded).
const LINK_PATTERN =
	'(?<url>(?:https?|ftp):\\/\\/[^\\s<]+)' +
	'|(?<www>www\\.[^\\s<]+)' +
	'|(?<email>[A-Za-z0-9._%+\\-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,})';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Removes trailing punctuation that is almost certainly sentence punctuation
 * rather than part of the link (e.g. the period in "see https://ovmeet.io.").
 * A closing paren is only trimmed when the link contains no opening paren, so
 * balanced URLs like `…/Foo_(bar)` are preserved.
 */
function trimTrailingPunctuation(link: string): string {
	let trimmed = link.replace(/[.,;:!?'"]+$/, '');

	if (trimmed.endsWith(')') && !trimmed.includes('(')) {
		trimmed = trimmed.slice(0, -1);
	}

	return trimmed;
}

function buildAnchor(href: string, text: string): string {
	return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

/**
 * @internal
 */
export class Linkifier {
	public link(text: string): string {
		if (!text) {
			return text;
		}

		const matcher = new RegExp(LINK_PATTERN, 'gi');
		let result = '';
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = matcher.exec(text)) !== null) {
			const raw = trimTrailingPunctuation(match[0]);
			const end = match.index + raw.length;

			// Escape the plain-text gap that precedes this link.
			result += escapeHtml(text.slice(lastIndex, match.index));

			const groups = match.groups ?? {};
			let href: string;

			if (groups['email']) {
				href = `mailto:${raw}`;
			} else if (groups['www']) {
				href = `https://${raw}`;
			} else {
				href = raw;
			}

			result += buildAnchor(href, raw);
			lastIndex = end;

			// If trailing punctuation was trimmed, resume scanning right after the
			// trimmed link so those characters are emitted as plain text.
			matcher.lastIndex = end;
		}

		result += escapeHtml(text.slice(lastIndex));

		return result;
	}
}
