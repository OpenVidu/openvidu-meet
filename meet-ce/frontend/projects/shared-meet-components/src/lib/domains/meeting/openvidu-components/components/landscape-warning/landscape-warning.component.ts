import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * Component to display a landscape orientation warning on mobile devices.
 * @internal
 */
@Component({
	selector: 'ov-landscape-warning',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './landscape-warning.component.html',
	styleUrl: './landscape-warning.component.scss'
})
export class LandscapeWarningComponent {}
