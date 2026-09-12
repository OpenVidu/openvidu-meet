import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yamljs';

// Redocly validates the specs against the schema, but `MeetPermissions` declares no `required`
// keys, so a hand-written example that omits a permission passes silently and the rendered public
// reference under-reports the contract (it happened twice: `meetingRead`, then `participantMute`).
// This diffs every full-permission example against the contract instead.

const OPENAPI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../openapi');

const PERMISSION_KEYS = MEET_PERMISSION_KEYS as readonly string[];

// A full-permission example quotes at least half the contract; partial override examples
// (customPermissions, role patches) stay well below this.
const FULL_SET_THRESHOLD = Math.ceil(PERMISSION_KEYS.length / 2);

const yamlFiles = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			return yamlFiles(fullPath);
		}

		return entry.name.endsWith('.yaml') ? [fullPath] : [];
	});

const isBooleanRecord = (value: unknown): value is Record<string, boolean> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.keys(value).length > 0 &&
	Object.values(value).every((entry) => typeof entry === 'boolean');

const collectFullPermissionExamples = (node: unknown, file: string, found: { file: string; keys: string[] }[]) => {
	if (typeof node !== 'object' || node === null) {
		return;
	}

	if (isBooleanRecord(node)) {
		const keys = Object.keys(node);

		if (keys.filter((key) => PERMISSION_KEYS.includes(key)).length >= FULL_SET_THRESHOLD) {
			found.push({ file, keys });
		}

		return;
	}

	for (const value of Object.values(node)) {
		collectFullPermissionExamples(value, file, found);
	}
};

describe('OpenAPI full-permission examples', () => {
	it('should quote every permission the contract declares', () => {
		const examples: { file: string; keys: string[] }[] = [];

		for (const file of yamlFiles(OPENAPI_DIR)) {
			collectFullPermissionExamples(YAML.load(file), path.relative(OPENAPI_DIR, file), examples);
		}

		// The known full-permission examples (get-room, get-rooms, get-room-member, get-room-members);
		// zero matches would mean the detector broke, not that the specs are clean.
		expect(examples.length).toBeGreaterThanOrEqual(9);

		for (const example of examples) {
			const missing = PERMISSION_KEYS.filter((key) => !example.keys.includes(key));
			expect({ file: example.file, missing }).toEqual({ file: example.file, missing: [] });
		}
	});
});
