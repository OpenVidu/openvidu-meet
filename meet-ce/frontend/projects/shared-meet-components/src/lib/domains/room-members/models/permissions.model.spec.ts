import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import { PERMISSION_GROUPS } from './permissions.model';

/**
 * UI-side twin of the backend's alias-map guard: the permissions form is built from
 * `PERMISSION_GROUPS`, so a permission added to the contract but not here silently never gets a
 * checkbox (and one listed twice gets two fighting controls). The i18n-key convention is asserted
 * too because the label keys were renamed with the permissions and the locale files follow the key.
 */
describe('PERMISSION_GROUPS', () => {
	const items = PERMISSION_GROUPS.flatMap((group) => group.permissions);

	it('should cover every contract permission key exactly once', () => {
		const keys = items.map((item) => item.key);

		expect(keys.length).toBe(MEET_PERMISSION_KEYS.length);
		expect(new Set(keys).size).toBe(keys.length);

		for (const key of MEET_PERMISSION_KEYS) {
			expect(keys).withContext(key).toContain(key);
		}
	});

	it('should list the five split recording capabilities in the RECORDINGS group', () => {
		const recordings = PERMISSION_GROUPS.find((group) => group.label.endsWith('.RECORDINGS'));

		expect(recordings).toBeDefined();
		expect(recordings!.permissions.map((item) => item.key)).toEqual([
			'recordingControl',
			'recordingList',
			'recordingPlay',
			'recordingDownload',
			'recordingDelete'
		]);
	});

	it('should derive every label and description i18n key from the permission key', () => {
		for (const item of items) {
			expect(item.label).toBe(`ROOM_MEMBERS.PERMISSIONS.ITEMS.${item.key}.LABEL`);
			expect(item.description).toBe(`ROOM_MEMBERS.PERMISSIONS.ITEMS.${item.key}.DESCRIPTION`);
		}
	});
});
