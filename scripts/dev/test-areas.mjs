// The map behind `./meet.sh affected`: which integration and e2e tests cover each area of the product.
//
// An area is close to an OpenSpec capability (`specs` defaults to [name]; an area that answers no capability
// has `specs: []` and is named by its paths only). `paths` are source globs (`*` stays inside a folder, `**` crosses
// folders). Per heavy suite, the tests that cover it:
//   backend:  a folder of tests/integration (a key of BACKEND_FOLDER_SCRIPTS) or a test file relative to tests/integration
//   frontend: a spec file of meet-ce/frontend/e2e
//   wc:       a spec file of meet-ce/frontend/webcomponent/tests/e2e, or [file, grep] to run only its matching tests

const BACKEND = 'meet-ce/backend/src/';
const TYPINGS = 'meet-ce/typings/src/';
const LIBRARY = 'meet-ce/frontend/projects/shared-meet-components/src/lib/domains/';
const MEETING = `${LIBRARY}meeting/`;

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
		paths: [`${BACKEND}**/*global-config*`],
		backend: ['global-config']
	},
	authentication: {
		paths: [`${BACKEND}**/*auth*`, `${BACKEND}**/*token*`, `${BACKEND}**/*api-key*`, `${LIBRARY}auth/**`],
		backend: ['auth', 'api-keys', 'security'],
		frontend: ['token-refresh.test.ts']
	},
	console: {
		paths: [`${LIBRARY}console/**`, `${BACKEND}**/*analytics*`],
		backend: ['analytics'],
		frontend: ['console.test.ts']
	},
	'embedded-api': {
		paths: [
			`${TYPINGS}embedded/**`,
			`${LIBRARY}embedded/**`,
			'meet-ce/frontend/webcomponent/src/**',
			'meet-ce/frontend/webcomponent/tests/helpers/**',
			'testapp/**'
		],
		wc: ['events.test.ts', 'commands.test.ts']
	},
	'embedded-attributes': {
		specs: [],
		paths: [`${TYPINGS}embedded/attributes.ts`],
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
		paths: [
			`${BACKEND}**/*broadcast*`,
			`${MEETING}**/*broadcast*`,
			`${TYPINGS}database/broadcast*`,
			`${TYPINGS}request/broadcast*`
		],
		backend: ['api/meetings/broadcasts.test.ts', 'api/rooms/broadcast-room-config.test.ts'],
		frontend: ['broadcasts.test.ts'],
		wc: [
			['events.test.ts', 'BROADCAST'],
			['commands.test.ts', 'BROADCAST']
		]
	},
	'live-captions': {
		paths: [`${BACKEND}**/*ai-assistant*`, `${MEETING}**/*caption*`, `${TYPINGS}ai-assistant.ts`],
		backend: ['api/meetings/ai-assistant.test.ts'],
		frontend: ['captions.test.ts']
	},
	localization: {
		paths: [`${LIBRARY}**/lang/**`, `${LIBRARY}**/*i18n*`],
		wc: [['attributes.test.ts', 'with language']]
	},
	'locked-room': {
		paths: [
			`${BACKEND}**/waiting-participant*`,
			`${BACKEND}services/waiting-participants/**`,
			`${BACKEND}**/*websocket*`,
			`${MEETING}waiting-participants/**`,
			`${MEETING}**/*lock*`
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
		frontend: ['chat.test.ts']
	},
	'meeting-join': {
		paths: [`${BACKEND}**/participant-name*`, `${MEETING}**/*join*`, `${MEETING}**/*entry*`],
		backend: [
			'api/meetings/participant-name.service.test.ts',
			'api/meetings/participant-name-reservation-ttl.test.ts'
		],
		frontend: ['meeting-start.test.ts']
	},
	'meeting-layout': {
		paths: [`${MEETING}**/*layout*`, `${MEETING}**/*toolbar*`, `${MEETING}**/*panel*`],
		frontend: ['layout.test.ts', 'panels.test.ts', 'toolbar.test.ts']
	},
	'meeting-media': {
		paths: [
			`${MEETING}**/*media*`,
			`${MEETING}**/*device*`,
			`${MEETING}**/*screen*`,
			`${MEETING}**/*virtual-background*`,
			`${MEETING}**/*stream*`,
			`${MEETING}**/*quality*`
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
		paths: [`${BACKEND}**/*moderation*`, `${MEETING}**/*moderation*`, `${MEETING}**/*participant*`],
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
		paths: [`${BACKEND}**/meeting.*`, `${BACKEND}**/meeting-presence*`, `${BACKEND}**/livekit*`],
		backend: ['meetings'],
		frontend: ['meeting-start.test.ts']
	},
	permissions: {
		paths: [
			`${BACKEND}**/*permission*`,
			`${LIBRARY}**/*permission*`,
			`${TYPINGS}database/room-member-permissions.ts`,
			`${TYPINGS}livekit-permissions.ts`
		],
		backend: ['room-members', 'api/rooms/permission-naming.test.ts'],
		frontend: ['permissions.test.ts']
	},
	'raise-hand': {
		paths: [`${MEETING}**/meeting-hand*`, `${MEETING}**/*raise-hand*`, `${MEETING}**/*lower-hand*`],
		backend: ['api/meetings/hand.test.ts'],
		wc: [
			['events.test.ts', 'HAND'],
			['commands.test.ts', 'HAND']
		]
	},
	reactions: {
		paths: [`${BACKEND}**/*reaction*`, `${MEETING}**/*reaction*`, `${TYPINGS}reaction.ts`],
		backend: ['api/meetings/reaction.test.ts'],
		wc: [['commands.test.ts', 'SEND_REACTION']]
	},
	recordings: {
		paths: [
			`${BACKEND}**/*recording*`,
			`${BACKEND}**/*egress*`,
			`${BACKEND}services/storage/**`,
			`${LIBRARY}recordings/**`,
			`${MEETING}**/*recording*`,
			`${TYPINGS}database/recording*`
		],
		backend: ['recordings'],
		frontend: ['recordings.test.ts'],
		wc: [
			['events.test.ts', 'RECORDING'],
			['commands.test.ts', 'RECORDING']
		]
	},
	'room-access': {
		paths: [`${BACKEND}**/*room-access*`, `${MEETING}**/*room-access*`, `${MEETING}**/*share-link*`],
		frontend: ['access.test.ts', 'share-link.test.ts']
	},
	'room-config': {
		paths: [`${BACKEND}**/*room-config*`, `${TYPINGS}database/room-config.ts`],
		backend: [
			'api/rooms/get-room-config.test.ts',
			'api/rooms/e2ee-room-config.test.ts',
			'api/rooms/broadcast-room-config.test.ts',
			'api/rooms/recording-layout-room-config.test.ts'
		],
		frontend: ['room-features.test.ts', 'e2ee.test.ts', 'room-wizard.test.ts']
	},
	'room-members': {
		paths: [`${BACKEND}**/room-member*`, `${LIBRARY}room-members/**`, `${TYPINGS}database/room-member*`],
		backend: ['room-members'],
		wc: ['identified-guest-state.test.ts']
	},
	rooms: {
		paths: [`${BACKEND}**/room.*`, `${BACKEND}**/room-scheduled-tasks*`, `${LIBRARY}rooms/**`],
		backend: ['rooms'],
		frontend: ['room-wizard.test.ts']
	},
	users: {
		paths: [`${BACKEND}**/*user*`, `${LIBRARY}users/**`],
		backend: ['users'],
		frontend: ['console.test.ts']
	},
	webhooks: {
		paths: [
			`${BACKEND}**/*webhook*`,
			`${TYPINGS}webhook.ts`,
			`${TYPINGS}leave-reason.ts`,
			`${TYPINGS}event-origin.ts`
		],
		backend: ['webhooks'],
		wc: ['webhooks.test.ts']
	}
};
