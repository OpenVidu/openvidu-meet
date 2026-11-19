import { AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { TextMatchMode } from '@openvidu-meet/typings';

export interface NameSearchControls {
	nameFilter: FormControl<string>;
	nameMatchMode: FormControl<TextMatchMode>;
	nameCaseInsensitive: FormControl<boolean>;
}

/** The edits a list's search box and filter chips make to its filters form. */
export class ListFilterControls<TControls extends NameSearchControls & { [K in keyof TControls]: AbstractControl }> {
	constructor(private readonly form: FormGroup<TControls>) {}

	clearName() {
		this.form.controls.nameFilter.setValue('');
	}

	setMatchMode(mode: TextMatchMode) {
		this.form.controls.nameMatchMode.setValue(mode);
	}

	toggleCaseInsensitive() {
		const control = this.form.controls.nameCaseInsensitive;
		control.setValue(!control.value);
	}

	remove(key: string) {
		const control = (this.form.controls as Record<string, FormControl>)[key];

		if (!control) return;

		if (typeof control.value === 'boolean') control.setValue(false);
		else control.setValue(Array.isArray(control.value) ? [] : '');
	}
}
