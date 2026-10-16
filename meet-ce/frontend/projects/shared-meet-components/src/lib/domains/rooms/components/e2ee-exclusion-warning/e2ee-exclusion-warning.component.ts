import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/**
 * Warns, in the wizard step of a feature end-to-end encryption excludes, that the room encrypts its
 * meetings, so enabling the feature turns the encryption off. The texts are the step's own.
 */
@Component({
	selector: 'ov-e2ee-exclusion-warning',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './e2ee-exclusion-warning.component.html',
	styleUrl: './e2ee-exclusion-warning.component.scss'
})
export class E2eeExclusionWarningComponent {
	/** The i18n namespace of the step: it holds `RESTRICTIONS` and `E2EE_WARNING_PREFIX`, `_BOLD` and `_SUFFIX`. */
	readonly keys = input.required<string>();
}
