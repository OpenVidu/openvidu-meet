// The map behind `./meet.sh affected`: which integration and e2e tests cover each area of the product.
//
// An area is close to an OpenSpec capability (`specs` defaults to [name]; an area that answers no capability
// has `specs: []` and is named by its paths only). `paths` are source globs (`*` stays inside a folder, `**` crosses
// folders). Per heavy suite, the tests that cover it:
//   backend:  a folder of tests/integration (a key of BACKEND_FOLDER_SCRIPTS) or a test file relative to tests/integration
//   frontend: a spec file of meet-ce/frontend/e2e, or [file, grep] to run only its matching tests
//   console:  a spec file of meet-ce/frontend/e2e/console, or [file, grep]
//   wc:       a spec file of meet-ce/frontend/webcomponent/tests/e2e, or [file, grep]
//
// A source file shared by every area (configuration, errors, Redis, the server) belongs to none: `affected`
// names it and leaves it to the whole suites in CI. `scripts/dev/affected-tests.test.mjs` pins the cases this
// map has to get right; add one when a pull request shows a test it should have listed.

const BACKEND = 'meet-ce/backend/src/';
const TYPINGS = 'meet-ce/typings/src/';
const LIBRARY = 'meet-ce/frontend/projects/shared-meet-components/src/lib/';
const DOMAINS = `${LIBRARY}domains/`;
const MEETING = `${DOMAINS}meeting/`;
const MEETING_UI = `${MEETING}openvidu-components/`;

export const BACKEND_FOLDER_SCRIPTS = {
	analytics: 'test:integration-analytics',
	'api-keys': 'test:integration-api-keys',
	auth: 'test:integration-auth',
	'global-config': 'test:integration-global-config',
	meetings: 'test:integration-meetings',
	recordings: 'test:integration-recordings',
	'room-members': 'test:integration-room-members',
	rooms: 'test:integration-rooms',
	security: 'test:integration-security',
	users: 'test:integration-users',
	webhooks: 'test:integration-webhooks',
	websocket: 'test:integration-websocket'
};

export const NO_TESTS_OF_THEIR_OWN = ['deployment'];

export const AREAS = {
	appearance: {
		paths: [`${BACKEND}**/*global-config*`, `${BACKEND}**/config-validator*`, `${TYPINGS}**/global-config*`],
		backend: ['global-config', 'api/security/global-config-security.test.ts'],
		console: ['appearance.test.ts']
	},
	authentication: {
		paths: [
			`${BACKEND}**/*auth*`,
			`${BACKEND}**/*token*`,
			`${BACKEND}**/*api-key*`,
			`${TYPINGS}**/api-key*`,
			`${DOMAINS}auth/**`,
			`${LIBRARY}shared/**/*token*`,
			`${LIBRARY}shared/**/*api-key*`
		],
		backend: ['auth', 'api-keys', 'security'],
		frontend: ['token-refresh.test.ts'],
		console: ['auth.test.ts', ['embedded.test.ts', 'API key'], ['users.test.ts', 'password']]
	},
	console: {
		paths: [
			`${DOMAINS}console/**`,
			`${LIBRARY}**/*analytics*`,
			`${BACKEND}**/*analytics*`,
			`${TYPINGS}analytics.ts`
		],
		backend: ['analytics', 'api/security/analytics-security.test.ts'],
		console: [
			'navigation.test.ts',
			'embedded.test.ts',
			'appearance.test.ts',
			'rooms.test.ts',
			'users.test.ts',
			'recordings.test.ts'
		]
	},
	e2ee: {
		specs: [],
		paths: [`${DOMAINS}**/*e2ee*`],
		backend: ['api/rooms/e2ee-room-config.test.ts'],
		frontend: ['e2ee.test.ts']
	},
	'embedded-api': {
		paths: [
			`${TYPINGS}embedded/**`,
			`${DOMAINS}embedded/**`,
			`${MEETING}services/meeting-event-handler*`,
			'meet-ce/frontend/webcomponent/src/**',
			'meet-ce/frontend/webcomponent/tests/helpers/**',
			'testapp/**'
		],
		wc: ['events.test.ts', 'commands.test.ts']
	},
	'embedded-attributes': {
		specs: [],
		paths: [`${TYPINGS}embedded/attributes.ts`, `${MEETING}guards/extract-*`, `${LIBRARY}**/*leave-redirect*`],
		wc: ['attributes.test.ts']
	},
	'embedded-distribution': {
		paths: [
			`${BACKEND}**/*webcomponent*`,
			'meet-ce/frontend/webcomponent/package.json',
			'meet-ce/frontend/webcomponent/angular.json'
		],
		wc: ['bundle-caching.test.ts', 'room.test.ts']
	},
	'live-broadcast': {
		paths: [`${BACKEND}**/*broadcast*`, `${LIBRARY}**/*broadcast*`, `${TYPINGS}**/broadcast*`],
		backend: ['api/meetings/broadcasts.test.ts', 'api/rooms/broadcast-room-config.test.ts'],
		frontend: ['broadcasts.test.ts'],
		wc: [
			['events.test.ts', 'BROADCAST'],
			['commands.test.ts', 'BROADCAST']
		]
	},
	'live-captions': {
		paths: [
			`${BACKEND}**/*ai-assistant*`,
			`${LIBRARY}**/*ai-assistant*`,
			`${MEETING}**/*caption*`,
			`${TYPINGS}ai-assistant.ts`
		],
		backend: ['api/meetings/ai-assistant.test.ts'],
		frontend: ['captions.test.ts']
	},
	localization: {
		paths: [`${LIBRARY}**/lang/**`, `${LIBRARY}**/i18n/**`, `${LIBRARY}**/*lang*`, `${LIBRARY}**/*translate*`],
		console: [
			['navigation.test.ts', 'language'],
			['rooms.test.ts', 'selected language'],
			['room-detail.test.ts', 'selected language']
		],
		wc: [['attributes.test.ts', 'with language']]
	},
	'locked-room': {
		paths: [
			`${BACKEND}**/waiting-participant*`,
			`${BACKEND}services/waiting-participants/**`,
			`${BACKEND}**/*websocket*`,
			`${TYPINGS}**/waiting-participant*`,
			`${TYPINGS}websocket.ts`,
			`${MEETING}waiting-participants/**`,
			`${MEETING}**/*websocket*`
		],
		backend: [
			'api/meetings/waiting-participants.test.ts',
			'api/meetings/waiting-participant-state.test.ts',
			'websocket'
		],
		frontend: ['locked-room.test.ts'],
		wc: [
			['events.test.ts', 'Locked room'],
			['commands.test.ts', 'Waiting participant']
		]
	},
	'meeting-chat': {
		paths: [`${MEETING}**/*chat*`],
		frontend: ['chat.test.ts', 'e2ee.test.ts']
	},
	'meeting-join': {
		paths: [`${BACKEND}**/participant-name*`, `${MEETING}**/*join*`, `${MEETING}**/*entry*`],
		backend: [
			'api/meetings/participant-name.service.test.ts',
			'api/meetings/participant-name-reservation-ttl.test.ts'
		],
		frontend: ['meeting-start.test.ts', ['permissions.test.ts', 'Join screen']]
	},
	'meeting-layout': {
		paths: [
			`${MEETING}**/*layout*`,
			`${MEETING}**/*toolbar*`,
			`${MEETING}**/*panel*`,
			`${MEETING}**/status-rail/**`,
			`${MEETING}**/landscape-warning/**`,
			`${MEETING}**/*viewport*`,
			`${MEETING}**/*shortcut*`
		],
		frontend: ['layout.test.ts', 'panels.test.ts', 'toolbar.test.ts'],
		wc: ['room.test.ts']
	},
	'meeting-media': {
		paths: [
			`${MEETING}**/*media*`,
			`${MEETING}**/*device*`,
			`${MEETING}**/*screen*`,
			`${MEETING}**/*background*`,
			`${MEETING}**/*stream*`,
			`${MEETING}**/*quality*`,
			`${MEETING}**/*mic-*`,
			`${MEETING}**/*audio-*`,
			`${MEETING}**/*video-*`
		],
		frontend: [
			'media-devices.test.ts',
			'stream.test.ts',
			'screensharing.test.ts',
			'virtual-backgrounds.test.ts',
			'connection-quality-indicator.test.ts'
		],
		wc: [
			['commands.test.ts', 'MEDIA_TOGGLE'],
			['events.test.ts', 'MEDIA_']
		]
	},
	'meeting-moderation': {
		paths: [`${MEETING}**/*moderation*`, `${MEETING}**/*participant*`],
		backend: [
			'api/meetings/kick-participant.test.ts',
			'api/meetings/mute-participant.test.ts',
			'api/meetings/update-participant.test.ts',
			'api/meetings/end-meeting.test.ts'
		],
		frontend: ['participants.test.ts'],
		wc: [['commands.test.ts', 'KICK_PARTICIPANT|PARTICIPANT_MUTE|UPDATE_ROLE|END_MEETING']]
	},
	meetings: {
		paths: [
			`${BACKEND}**/meeting.*`,
			`${BACKEND}**/meeting-*`,
			`${BACKEND}**/livekit*`,
			`${BACKEND}**/frontend-event*`,
			`${BACKEND}**/participant.helper.ts`,
			`${TYPINGS}**/meeting*`,
			`${TYPINGS}**/participant*`,
			`${TYPINGS}frontend-signal.ts`,
			`${MEETING}pages/**`,
			`${MEETING}routes/**`,
			`${MEETING}services/meeting-context*`,
			`${MEETING}services/meeting-state*`,
			`${MEETING_UI}components/meeting-view/**`,
			`${MEETING_UI}services/livekit/**`,
			`${MEETING_UI}services/meeting-*/**`
		],
		backend: ['meetings', 'api/security/meeting-security.test.ts', 'webhooks/webhook.test.ts'],
		frontend: ['meeting-start.test.ts', 'e2ee.test.ts'],
		wc: ['room.test.ts']
	},
	permissions: {
		paths: [
			`${BACKEND}**/*permission*`,
			`${DOMAINS}**/*permission*`,
			`${TYPINGS}database/room-member-permissions.ts`,
			`${TYPINGS}livekit-permissions.ts`
		],
		backend: ['room-members', 'api/rooms/permission-naming.test.ts', 'api/rooms/room-migrations.test.ts'],
		frontend: ['permissions.test.ts']
	},
	'raise-hand': {
		paths: [`${MEETING}**/meeting-hand*`, `${MEETING}**/*raised-hand*`],
		backend: ['api/meetings/hand.test.ts'],
		wc: [
			['events.test.ts', 'HAND'],
			['commands.test.ts', 'HAND']
		]
	},
	reactions: {
		paths: [`${MEETING}**/*reaction*`, `${TYPINGS}reaction.ts`],
		backend: ['api/meetings/reaction.test.ts'],
		wc: [['commands.test.ts', 'SEND_REACTION']]
	},
	recordings: {
		paths: [
			`${BACKEND}**/*recording*`,
			`${BACKEND}**/*egress*`,
			`${BACKEND}services/storage/**`,
			`${BACKEND}**/storage-key*`,
			`${BACKEND}**/encoding-converter*`,
			`${BACKEND}**/s3-sse*`,
			`${DOMAINS}recordings/**`,
			`${MEETING}**/*recording*`,
			`${TYPINGS}**/recording*`
		],
		backend: ['recordings', 'api/security/recording-security.test.ts', 'webhooks/webhook.test.ts'],
		frontend: ['recordings.test.ts', ['permissions.test.ts', 'Recordings']],
		console: ['recordings.test.ts'],
		wc: [
			['events.test.ts', 'RECORDING'],
			['commands.test.ts', 'RECORDING']
		]
	},
	'room-access': {
		paths: [`${BACKEND}**/*room-access*`, `${DOMAINS}**/*room-access*`, `${MEETING}guards/**`],
		frontend: ['access.test.ts', 'share-link.test.ts']
	},
	'room-config': {
		paths: [
			`${TYPINGS}database/room-config.ts`,
			`${DOMAINS}rooms/**/*feature*`,
			`${DOMAINS}rooms/pages/room-wizard/**`
		],
		backend: [
			'api/rooms/get-room-config.test.ts',
			'api/rooms/update-room-config.test.ts',
			'api/rooms/e2ee-room-config.test.ts',
			'api/rooms/broadcast-room-config.test.ts',
			'api/rooms/recording-layout-room-config.test.ts'
		],
		frontend: ['room-features.test.ts', 'e2ee.test.ts'],
		console: ['room-wizard.test.ts']
	},
	'room-members': {
		paths: [`${BACKEND}**/room-member*`, `${DOMAINS}room-members/**`, `${TYPINGS}**/room-member*`],
		backend: ['room-members', 'api/security/room-members-security.test.ts'],
		console: ['room-detail.test.ts'],
		wc: ['identified-guest-state.test.ts']
	},
	rooms: {
		paths: [
			`${BACKEND}**/room.*`,
			`${BACKEND}**/room-scheduled-tasks*`,
			`${BACKEND}**/room-validator*`,
			`${BACKEND}**/room-migrations*`,
			`${BACKEND}**/room-id*`,
			`${BACKEND}**/room-projection*`,
			`${TYPINGS}**/room.entity.ts`,
			`${TYPINGS}**/room-request.ts`,
			`${TYPINGS}**/room-response.ts`,
			`${DOMAINS}rooms/**`
		],
		backend: ['rooms', 'api/security/room-security.test.ts'],
		console: ['room-wizard.test.ts', 'rooms.test.ts', 'room-detail.test.ts']
	},
	users: {
		paths: [`${BACKEND}**/*user*`, `${TYPINGS}**/user*`, `${DOMAINS}users/**`],
		backend: ['users', 'api/security/user-security.test.ts'],
		console: ['users.test.ts']
	},
	webhooks: {
		paths: [
			`${BACKEND}**/*webhook*`,
			`${TYPINGS}**/webhook*`,
			`${TYPINGS}leave-reason.ts`,
			`${TYPINGS}event-origin.ts`
		],
		backend: ['webhooks'],
		console: [['embedded.test.ts', 'webhook']],
		wc: ['webhooks.test.ts']
	}
};
