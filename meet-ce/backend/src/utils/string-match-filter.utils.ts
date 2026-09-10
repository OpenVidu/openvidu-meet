import { TextMatchMode } from '@openvidu-meet/typings';
import { INTERNAL_CONFIG } from '../config/internal-config.js';

export type StringMatchCondition = string | RegExp | { $gte: string; $lt: string };

/**
 * Builds a Mongo-compatible filter condition for string matching.
 */
export const buildStringMatchFilter = (
	value: string,
	matchMode: TextMatchMode = TextMatchMode.EXACT,
	caseInsensitive = false
): StringMatchCondition => {
	switch (matchMode) {
		case TextMatchMode.EXACT:
			return caseInsensitive ? new RegExp(`^${escapeRegexLiteral(value)}$`, 'i') : value;

		case TextMatchMode.PREFIX:
			if (caseInsensitive) {
				return new RegExp(`^${escapeRegexLiteral(value)}`, 'i');
			}

			return {
				$gte: value,
				$lt: `${value}\uffff`
			};

		case TextMatchMode.PARTIAL:
			return new RegExp(escapeRegexLiteral(value), caseInsensitive ? 'i' : '');

		case TextMatchMode.REGEX:
			return new RegExp(value, caseInsensitive ? 'i' : '');
	}
};

/**
 * Says why a caller-supplied pattern cannot be handed to the datastore, or nothing when it can.
 * MongoDB compiles patterns with PCRE, whose quantifier ceiling is far below JavaScript's, so a
 * pattern that compiles here can still be rejected there.
 */
export const invalidRegexPatternReason = (pattern: string): string | undefined => {
	if (pattern.length > INTERNAL_CONFIG.TEXT_MATCH_REGEX_MAX_LENGTH) {
		return `Regular expression pattern cannot exceed ${INTERNAL_CONFIG.TEXT_MATCH_REGEX_MAX_LENGTH} characters`;
	}

	try {
		new RegExp(pattern);
	} catch {
		return 'Invalid regular expression pattern';
	}

	const quantifierBounds = [...pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)].flatMap(([, min, max]) => [min, max]);

	if (quantifierBounds.some((bound) => Number(bound) > INTERNAL_CONFIG.TEXT_MATCH_REGEX_MAX_QUANTIFIER)) {
		return `Regular expression quantifiers cannot exceed ${INTERNAL_CONFIG.TEXT_MATCH_REGEX_MAX_QUANTIFIER}`;
	}

	return undefined;
};

/**
 * Escapes regex metacharacters so a user-provided value is interpreted literally.
 */
const escapeRegexLiteral = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
