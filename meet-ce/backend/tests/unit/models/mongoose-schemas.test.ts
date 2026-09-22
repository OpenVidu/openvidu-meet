import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import type { Schema } from 'mongoose';
import { MeetApiKeyModel } from '../../../src/models/mongoose-schemas/api-key.schema.js';
import { MeetGlobalConfigModel } from '../../../src/models/mongoose-schemas/global-config.schema.js';
import { MeetRecordingModel } from '../../../src/models/mongoose-schemas/recording.schema.js';
import { MeetRoomMemberModel } from '../../../src/models/mongoose-schemas/room-member.schema.js';
import { MeetRoomModel } from '../../../src/models/mongoose-schemas/room.schema.js';
import { MeetUserModel } from '../../../src/models/mongoose-schemas/user.schema.js';
import { MeetWebhookModel } from '../../../src/models/mongoose-schemas/webhook.schema.js';

/**
 * Mongoose drops what a schema does not declare and defaults what it does not require, both without
 * a word, so a field lost from a schema or a `required` flag flipped reads as "the caller did not
 * send it". These tests pin what each collection stores, which of it a document cannot be without,
 * and the indexes the list endpoints sort and filter on.
 */

const describePaths = (schema: Schema, prefix = ''): Record<string, string> =>
	Object.entries(schema.paths).reduce<Record<string, string>>((paths, [name, type]) => {
		const path = `${prefix}${name}`;
		const declaration = type as unknown as { isRequired?: boolean; instance?: string; schema?: Schema };
		paths[path] = `${declaration.instance ?? 'Unknown'}${declaration.isRequired ? ' required' : ''}`;
		const subSchema = declaration.schema;

		if (subSchema) {
			Object.assign(paths, describePaths(subSchema, `${path}.`));
		}

		return paths;
	}, {});

const permissionPaths = (prefix: string, declaration: string): Record<string, string> =>
	Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [`${prefix}.${key}`, declaration]));

const roomPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	roomId: 'String required',
	roomName: 'String required',
	owner: 'String required',
	creationDate: 'Number required',
	autoDeletionDate: 'Number',
	autoDeletionPolicy: 'Embedded',
	'autoDeletionPolicy.withMeeting': 'String required',
	'autoDeletionPolicy.withRecordings': 'String required',
	config: 'Embedded required',
	'config.maxParticipants': 'Number',
	'config.maxDurationMinutes': 'Number',
	'config.initialAudioActive': 'Boolean',
	'config.initialVideoActive': 'Boolean',
	'config.chat': 'Embedded required',
	'config.chat.enabled': 'Boolean required',
	'config.recording': 'Embedded required',
	'config.recording.enabled': 'Boolean required',
	'config.recording.autoStart': 'String',
	'config.recording.layout': 'String required',
	'config.recording.encoding': 'Mixed required',
	'config.virtualBackground': 'Embedded required',
	'config.virtualBackground.enabled': 'Boolean required',
	'config.e2ee': 'Embedded required',
	'config.e2ee.enabled': 'Boolean required',
	'config.captions': 'Embedded required',
	'config.captions.enabled': 'Boolean required',
	roles: 'Embedded required',
	'roles.moderator.permissions': 'Embedded required',
	...permissionPaths('roles.moderator.permissions', 'Boolean required'),
	'roles.speaker.permissions': 'Embedded required',
	...permissionPaths('roles.speaker.permissions', 'Boolean required'),
	access: 'Embedded required',
	'access.anonymous.moderator.enabled': 'Boolean required',
	'access.anonymous.moderator.url': 'String required',
	'access.anonymous.speaker.enabled': 'Boolean required',
	'access.anonymous.speaker.url': 'String required',
	'access.anonymous.recording.enabled': 'Boolean required',
	'access.anonymous.recording.url': 'String required',
	'access.user.enabled': 'Boolean required',
	'access.user.url': 'String required',
	status: 'String required',
	rolesUpdatedAt: 'Number required',
	meetingEndAction: 'String required'
};

const roomMemberPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	memberId: 'String required',
	roomId: 'String required',
	type: 'String required',
	name: 'String required',
	membershipDate: 'Number required',
	accessUrl: 'String required',
	baseRole: 'String required',
	customPermissions: 'Embedded',
	...permissionPaths('customPermissions', 'Boolean'),
	effectivePermissions: 'Embedded required',
	...permissionPaths('effectivePermissions', 'Boolean required'),
	permissionsUpdatedAt: 'Number required'
};

const recordingPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	recordingId: 'String required',
	roomId: 'String required',
	roomName: 'String required',
	roomOwner: 'String required',
	roomUserAccess: 'Boolean required',
	status: 'String required',
	layout: 'String required',
	encoding: 'Mixed required',
	filename: 'String',
	startDate: 'Number',
	endDate: 'Number',
	duration: 'Number',
	size: 'Number',
	errorCode: 'Number',
	error: 'String',
	details: 'String',
	'accessSecrets.public': 'String required',
	'accessSecrets.private': 'String required'
};

const userPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	userId: 'String required',
	name: 'String required',
	registrationDate: 'Number required',
	role: 'String required',
	roleUpdatedAt: 'Number required',
	passwordHash: 'String required',
	mustChangePassword: 'Boolean required'
};

const apiKeyPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	key: 'String required',
	creationDate: 'Number required'
};

const globalConfigPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	securityConfig: 'Embedded required',
	'securityConfig.authentication': 'Embedded required',
	'securityConfig.authentication.oauthProviders': 'Array required',
	'securityConfig.authentication.oauthProviders.provider': 'String required',
	'securityConfig.authentication.oauthProviders.clientId': 'String required',
	'securityConfig.authentication.oauthProviders.clientSecret': 'String required',
	'securityConfig.authentication.oauthProviders.redirectUri': 'String required',
	roomsConfig: 'Embedded required',
	'roomsConfig.appearance': 'Embedded required',
	'roomsConfig.appearance.themes': 'Array required',
	'roomsConfig.appearance.themes.name': 'String required',
	'roomsConfig.appearance.themes.enabled': 'Boolean required',
	'roomsConfig.appearance.themes.baseTheme': 'String required',
	'roomsConfig.appearance.themes.backgroundColor': 'String',
	'roomsConfig.appearance.themes.primaryColor': 'String',
	'roomsConfig.appearance.themes.secondaryColor': 'String',
	'roomsConfig.appearance.themes.accentColor': 'String',
	'roomsConfig.appearance.themes.surfaceColor': 'String'
};

const webhookPaths = {
	_id: 'ObjectId',
	schemaVersion: 'Number required',
	webhookId: 'String required',
	url: 'String required',
	events: 'Array',
	roomId: 'String',
	enabled: 'Boolean required',
	creationDate: 'Number required'
};

const schemas: [string, { schema: Schema; modelName: string }, Record<string, string>, unknown[]][] = [
	[
		'MeetRoom',
		MeetRoomModel,
		roomPaths,
		[
			[{ roomId: 1 }, { unique: true }],
			[{ creationDate: -1, _id: -1 }, {}],
			[{ roomName: 1, creationDate: -1, _id: -1 }, {}],
			[{ status: 1, creationDate: -1, _id: -1 }, {}],
			[{ owner: 1, creationDate: -1, _id: -1 }, {}],
			[{ 'access.user.enabled': 1, creationDate: -1, _id: -1 }, {}],
			[{ autoDeletionDate: 1, _id: 1 }, {}]
		]
	],
	[
		'MeetRoomMember',
		MeetRoomMemberModel,
		roomMemberPaths,
		[
			[{ roomId: 1, memberId: 1 }, { unique: true }],
			[{ roomId: 1, membershipDate: -1, _id: -1 }, {}],
			[{ roomId: 1, name: 1, membershipDate: -1, _id: -1 }, {}],
			[{ roomId: 1, name: 1, _id: 1 }, {}],
			[{ memberId: 1, 'effectivePermissions.recordingList': 1 }, {}]
		]
	],
	[
		'MeetRecording',
		MeetRecordingModel,
		recordingPaths,
		[
			[{ recordingId: 1 }, { unique: true }],
			[{ startDate: -1, _id: -1 }, {}],
			[{ roomId: 1, startDate: -1, _id: -1 }, {}],
			[{ roomName: 1, startDate: -1, _id: -1 }, {}],
			[{ roomOwner: 1, startDate: -1, _id: -1 }, {}],
			[{ roomUserAccess: 1, startDate: -1, _id: -1 }, {}],
			[{ status: 1, startDate: -1, _id: -1 }, {}],
			[{ duration: -1, _id: -1 }, {}],
			[{ size: -1, _id: -1 }, {}]
		]
	],
	[
		'MeetUser',
		MeetUserModel,
		userPaths,
		[
			[{ userId: 1 }, { unique: true }],
			[{ registrationDate: -1, _id: -1 }, {}],
			[{ name: 1, registrationDate: -1, _id: -1 }, {}],
			[{ role: 1, registrationDate: -1, _id: -1 }, {}],
			[{ name: 1, role: 1, _id: 1 }, {}]
		]
	],
	['MeetApiKey', MeetApiKeyModel, apiKeyPaths, [[{ key: 1 }, { unique: true }]]],
	['MeetGlobalConfig', MeetGlobalConfigModel, globalConfigPaths, []],
	['MeetWebhook', MeetWebhookModel, webhookPaths, [[{ webhookId: 1 }, { unique: true }]]]
];

describe.each(schemas)('%s mongoose schema', (name, model, paths, indexes) => {
	it('declares every persisted field, and which of them a document cannot be without', () => {
		expect(describePaths(model.schema)).toEqual(paths);
	});

	it('declares the indexes its queries sort and filter on', () => {
		expect(model.schema.indexes()).toEqual(indexes);
	});

	it('is registered under the collection name the migrations are keyed on', () => {
		expect(model.modelName).toBe(name);
	});
});
