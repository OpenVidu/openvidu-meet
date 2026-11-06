import { FormControl, FormGroup } from '@angular/forms';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import { syncDependentPermissions } from './permission-dependencies';

describe('syncDependentPermissions', () => {
	const buildForm = (values: Record<string, boolean> = {}): FormGroup =>
		new FormGroup(
			Object.fromEntries(
				MEET_PERMISSION_KEYS.map((key) => [
					key,
					new FormControl<boolean>(values[key] ?? true, { nonNullable: true })
				])
			)
		);

	it('should disable a dependent toggle while its parent is off, keeping its value', () => {
		const form = buildForm({ chatRead: false, chatWrite: true });

		syncDependentPermissions(form);

		expect(form.get('chatWrite')!.disabled).toBeTrue();
		expect(form.get('chatWrite')!.value).toBeTrue();
		expect(form.getRawValue().chatWrite).toBeTrue();
	});

	it('should enable it again once the parent is on', () => {
		const form = buildForm({ mediaPublishVideo: false });
		syncDependentPermissions(form);

		form.get('mediaPublishVideo')!.setValue(true);
		syncDependentPermissions(form);

		expect(form.get('mediaChangeVirtualBackground')!.enabled).toBeTrue();
	});

	it('should keep a locked dependent disabled whatever its parent says', () => {
		const form = buildForm();

		syncDependentPermissions(form, new Set(['broadcastEdit']));

		expect(form.get('broadcastControl')!.value).toBeTrue();
		expect(form.get('broadcastEdit')!.disabled).toBeTrue();
	});

	it('should leave the permissions no other one gates untouched', () => {
		const form = buildForm({ chatRead: false, mediaPublishVideo: false, broadcastControl: false });

		syncDependentPermissions(form);

		const disabled = Object.entries(form.controls)
			.filter(([, control]) => control.disabled)
			.map(([key]) => key);
		expect(disabled.sort()).toEqual(['broadcastEdit', 'chatWrite', 'mediaChangeVirtualBackground']);
	});

	it('should emit no value change', () => {
		const form = buildForm({ chatRead: false });
		let emissions = 0;
		form.valueChanges.subscribe(() => emissions++);

		syncDependentPermissions(form);

		expect(emissions).toBe(0);
	});
});
