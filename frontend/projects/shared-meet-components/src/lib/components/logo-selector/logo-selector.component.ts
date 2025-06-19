import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
	selector: 'ov-logo-selector',
	standalone: true,
	imports: [MatButtonModule, MatIconModule],
	templateUrl: './logo-selector.component.html',
	styleUrl: './logo-selector.component.scss'
})
export class LogoSelectorComponent {}
