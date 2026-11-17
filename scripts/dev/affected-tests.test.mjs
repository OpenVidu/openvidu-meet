import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan } from './affected-tests.mjs';

// The cases `./meet.sh affected` has to get right. Most come from merged pull requests: the files a change
// touched and the tests it had to change with them.

const BACKEND = 'meet-ce/backend/src';
const MEETING = 'meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting';
const EVENT_HANDLER = `${MEETING}/services/meeting-event-handler.service.ts`;

const targets = (files, suite) => {
	const listed = plan(files).targets[suite];
	return listed && Object.fromEntries([...listed].map(([key, target]) => [key, target.whole || [...target.greps]]));
};

test('a change to the embedded recording events lists the embedded specs and no backend test (#257)', () => {
	const files = [
		'meet-ce/typings/src/embedded/events.ts',
		EVENT_HANDLER,
		'meet-ce/frontend/webcomponent/src/app/app.ts',
		'testapp/src/app/app.html',
		'openspec/changes/unify-recording-lifecycle-events/specs/recordings/spec.md',
		'openspec/changes/unify-recording-lifecycle-events/specs/embedded-api/spec.md'
	];

	assert.equal(targets(files, 'backend-integration'), undefined);
	assert.deepEqual(targets(files, 'wc-e2e'), { 'events.test.ts': true, 'commands.test.ts': true });
	assert.deepEqual(targets(files, 'frontend-e2e'), {
		'recordings.test.ts': true,
		'permissions.test.ts': ['Recordings']
	});
});

test('a backend recording change lists the recordings folder and the tests of other folders that read it', () => {
	assert.deepEqual(Object.keys(targets([`${BACKEND}/services/recording.service.ts`], 'backend-integration')), [
		'recordings',
		'api/security/recording-security.test.ts',
		'webhooks/webhook.test.ts'
	]);
});

test('a folder absorbs the single tests of that folder', () => {
	const files = [`${BACKEND}/services/room.service.ts`, 'meet-ce/typings/src/database/room-config.ts'];

	assert.deepEqual(Object.keys(targets(files, 'backend-integration')), [
		'rooms',
		'api/security/room-security.test.ts'
	]);
});

test('a room member change lists its security tests (#170, #210)', () => {
	const listed = targets([`${BACKEND}/services/room-member.service.ts`], 'backend-integration');

	assert.ok('room-members' in listed);
	assert.ok('api/security/room-members-security.test.ts' in listed);
});

test('areas that narrow the same spec join their greps, and an area that wants it whole wins', () => {
	const narrowed = [`${BACKEND}/services/broadcast.service.ts`, `${BACKEND}/services/recording.service.ts`];

	assert.deepEqual(targets(narrowed, 'wc-e2e')['events.test.ts'], ['BROADCAST', 'RECORDING']);
	assert.equal(targets([...narrowed, EVENT_HANDLER], 'wc-e2e')['events.test.ts'], true);
});

test('a file is claimed by what it is, not by a word inside its name', () => {
	const { areas } = plan([EVENT_HANDLER]);

	assert.deepEqual(areas, ['embedded-api']);
});

test('a changed test file is listed, a deleted one is not', () => {
	const listed = targets(['meet-ce/frontend/e2e/chat.test.ts', 'meet-ce/frontend/e2e/gone.test.ts'], 'frontend-e2e');

	assert.deepEqual(listed, { 'chat.test.ts': true });
});

test('a shared file selects the suite, lists no test and is named as not covered', () => {
	const result = plan([`${BACKEND}/config/internal-config.ts`, 'meet-ce/backend/tests/helpers/request-helpers.ts']);

	assert.deepEqual(result.areas, []);
	assert.equal(result.targets['backend-integration'].size, 0);
	assert.deepEqual(result.unplaced, [
		`${BACKEND}/config/internal-config.ts`,
		'meet-ce/backend/tests/helpers/request-helpers.ts'
	]);
});

test('documentation, specs and unit tests select nothing and are not reported', () => {
	const result = plan([
		'CHANGELOG.md',
		'openspec/specs/rooms/spec.md',
		'meet-ce/backend/tests/unit/services/room.service.test.ts',
		`${MEETING}/services/meeting-context.service.spec.ts`
	]);

	assert.deepEqual(result.unplaced, []);
	assert.equal(result.targets['backend-integration'], undefined);
	assert.equal(result.targets['wc-e2e'], undefined);
});

test('the capability of an OpenSpec change names the area when no source path does', () => {
	const files = ['openspec/changes/lock-a-room/specs/locked-room/spec.md', `${BACKEND}/config/internal-config.ts`];
	const listed = targets(files, 'backend-integration');

	assert.deepEqual(plan(files).areas, ['locked-room']);
	assert.ok('websocket' in listed);
});
