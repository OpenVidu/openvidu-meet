import { FormGroup } from '@angular/forms';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { DEPENDENT_PERMISSIONS } from '../models/permissions.model';

/**
 * Makes each dependent permission toggle of a permissions form usable only while the permission it
 * depends on is on and nothing else locks it. Values are kept, and no event is emitted, so it can run
 * from the form's own `valueChanges` and after silent resets.
 */
export function syncDependentPermissions(
	permissionsForm: FormGroup,
	locked: ReadonlySet<keyof MeetRoomMemberPermissions> = new Set()
): void {
	for (const { key, dependsOn } of DEPENDENT_PERMISSIONS) {
		const dependent = permissionsForm.get(key);

		if (permissionsForm.get(dependsOn)?.value === true && !locked.has(key)) {
			dependent?.enable({ emitEvent: false });
		} else {
			dependent?.disable({ emitEvent: false });
		}
	}
}
