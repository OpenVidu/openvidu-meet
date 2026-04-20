import { describe, expect, test } from '@jest/globals';
import { parseCustomS3Headers } from '../../../../src/services/storage/providers/s3/s3-custom-headers.util.js';

describe('parseCustomS3Headers', () => {
	test('empty input returns empty map', () => {
		expect(Object.keys(parseCustomS3Headers(''))).toEqual([]);
	});

	test('normalizes names to lowercase (mixed case accepted)', () => {
		const out = parseCustomS3Headers('{"X-Custom-Tenant":"acme","x-Api-Version":"1"}');
		expect(out['x-custom-tenant']).toBe('acme');
		expect(out['x-api-version']).toBe('1');
		expect(Object.keys(out).sort()).toEqual(['x-api-version', 'x-custom-tenant']);
	});

	test('uppercase and lowercase duplicates of the same name are rejected', () => {
		expect(() => parseCustomS3Headers('{"X-Foo":"a","x-foo":"b"}')).toThrow(
			/specified multiple times/
		);
	});

	test('rejects non-object top-level JSON', () => {
		expect(() => parseCustomS3Headers('null')).toThrow(/JSON object/);
		expect(() => parseCustomS3Headers('[]')).toThrow(/JSON object/);
		expect(() => parseCustomS3Headers('"hi"')).toThrow(/JSON object/);
		expect(() => parseCustomS3Headers('42')).toThrow(/JSON object/);
	});

	test('rejects malformed JSON', () => {
		expect(() => parseCustomS3Headers('{not json}')).toThrow(/JSON object/);
	});

	test('rejects non-string values', () => {
		expect(() => parseCustomS3Headers('{"x-foo":1}')).toThrow(/must be a string/);
		expect(() => parseCustomS3Headers('{"x-foo":null}')).toThrow(/must be a string/);
		expect(() => parseCustomS3Headers('{"x-foo":true}')).toThrow(/must be a string/);
		expect(() => parseCustomS3Headers('{"x-foo":{}}')).toThrow(/must be a string/);
		expect(() => parseCustomS3Headers('{"x-foo":[]}')).toThrow(/must be a string/);
	});

	test.each([
		['authorization', '{"Authorization":"x"}'],
		['x-amz-date', '{"X-Amz-Date":"x"}'],
		['x-amz-content-sha256', '{"x-amz-content-sha256":"x"}'],
		['x-amz-security-token', '{"x-amz-security-token":"x"}'],
		['host', '{"Host":"x"}'],
		['content-length', '{"Content-Length":"x"}'],
		['content-md5', '{"Content-MD5":"x"}'],
		['content-type', '{"Content-Type":"x"}'],
		['content-encoding', '{"Content-Encoding":"x"}'],
		['transfer-encoding', '{"Transfer-Encoding":"chunked"}'],
		['expect', '{"Expect":"100-continue"}'],
		['__proto__', '{"__proto__":"x"}'],
		['constructor', '{"constructor":"x"}'],
		['prototype', '{"prototype":"x"}']
	])('rejects reserved/forbidden header: %s', (_name, raw) => {
		expect(() => parseCustomS3Headers(raw)).toThrow(/reserved/);
	});

	test('rejects CR/LF/NUL in header value (CRLF injection)', () => {
		expect(() => parseCustomS3Headers('{"x-foo":"a\\r\\nAuthorization: fake"}')).toThrow(
			/forbidden characters/
		);
		expect(() => parseCustomS3Headers('{"x-foo":"a\\nb"}')).toThrow(/forbidden characters/);
		expect(() => parseCustomS3Headers('{"x-foo":"a\\u0000b"}')).toThrow(/forbidden characters/);
		expect(() => parseCustomS3Headers('{"x-foo":"a\\u0001b"}')).toThrow(/forbidden characters/);
		expect(() => parseCustomS3Headers('{"x-foo":"a\\u007fb"}')).toThrow(/forbidden characters/);
	});

	test('allows HTAB and printable high-ASCII in values', () => {
		const out = parseCustomS3Headers('{"x-foo":"hello\\tworld"}');
		expect(out['x-foo']).toBe('hello\tworld');
	});

	test('rejects header names with whitespace or invalid chars', () => {
		expect(() => parseCustomS3Headers('{"x foo":"v"}')).toThrow(/invalid characters/);
		expect(() => parseCustomS3Headers('{"x:foo":"v"}')).toThrow(/invalid characters/);
		expect(() => parseCustomS3Headers('{"x\\r\\nInjected":"v"}')).toThrow(/invalid characters/);
		expect(() => parseCustomS3Headers('{"":"v"}')).toThrow(/invalid characters/);
		expect(() => parseCustomS3Headers('{"x(foo)":"v"}')).toThrow(/invalid characters/);
	});

	test('accepts RFC 7230 tchar names', () => {
		const out = parseCustomS3Headers(
			'{"X-Cache_control.test":"ok","!#$%&\'*+-.^_`|~Abc123":"ok"}'
		);
		expect(Object.keys(out).length).toBe(2);
	});

	test('returned map has null prototype (no proto pollution surface)', () => {
		const out = parseCustomS3Headers('{"x-foo":"bar"}');
		expect(Object.getPrototypeOf(out)).toBeNull();
	});

	test('empty map for empty object input also has null prototype', () => {
		const out = parseCustomS3Headers('{}');
		expect(Object.getPrototypeOf(out)).toBeNull();
		expect(Object.keys(out).length).toBe(0);
	});
});
