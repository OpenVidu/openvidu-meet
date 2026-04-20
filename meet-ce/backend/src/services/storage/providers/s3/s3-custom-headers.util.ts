// Reserved names are rejected at parse time. Signing-critical headers
// must not be overridden, prototype-pollution keys are never legitimate
// HTTP header names, and a few framing/interpretation headers are owned
// by the SDK/HTTP stack.
const RESERVED_HEADERS = new Set([
	'authorization',
	'x-amz-date',
	'x-amz-content-sha256',
	'x-amz-security-token',
	'host',
	'content-length',
	'content-md5',
	'content-type',
	'content-encoding',
	'transfer-encoding',
	'expect',
	'__proto__',
	'constructor',
	'prototype'
]);

// RFC 7230 token: 1*tchar
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Reject NUL, CR, LF and other C0 controls (allow HTAB=0x09), plus DEL.
// eslint-disable-next-line no-control-regex
const INVALID_HEADER_VALUE_RE = /[\x00-\x08\x0A-\x1F\x7F]/;

export function parseCustomS3Headers(raw: string): Record<string, string> {
	if (!raw) {
		return Object.create(null);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`MEET_S3_HEADERS must be a JSON object of string→string: ${(error as Error).message}`
		);
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('MEET_S3_HEADERS must be a JSON object of string→string');
	}
	const result: Record<string, string> = Object.create(null);
	for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
		if (!HEADER_NAME_RE.test(k)) {
			throw new Error(`MEET_S3_HEADERS: header name "${k}" contains invalid characters`);
		}
		if (typeof v !== 'string') {
			throw new Error(`MEET_S3_HEADERS: value for header "${k}" must be a string`);
		}
		if (INVALID_HEADER_VALUE_RE.test(v)) {
			throw new Error(
				`MEET_S3_HEADERS: value for header "${k}" contains forbidden characters (CR/LF/NUL/control)`
			);
		}
		const lower = k.toLowerCase();
		if (RESERVED_HEADERS.has(lower)) {
			throw new Error(`MEET_S3_HEADERS: header "${k}" is reserved and cannot be overridden`);
		}
		if (lower in result) {
			throw new Error(
				`MEET_S3_HEADERS: header "${k}" specified multiple times (case-insensitive)`
			);
		}
		result[lower] = v;
	}
	return result;
}
