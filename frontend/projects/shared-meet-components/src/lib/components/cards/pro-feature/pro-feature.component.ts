import { ChangeDetectorRef, Component } from '@angular/core';
import { BaseCardComponent } from '../base-card/base-card.component';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { NotificationService } from '../../../services';

@Component({
	selector: 'ov-pro-feature-card',
	standalone: true,
	imports: [BaseCardComponent, MatButtonModule, MatChipsModule],
	template: `
		<ov-base-card
			class="pro-feature-card"
			[title]="title"
			[description]="description"
			[icon]="icon"
			[iconUrl]="iconUrl"
			[iconBackgroundColor]="iconBackgroundColor"
			(click)="showDialog()"
		>
			<div card-header-tag>
				<mat-chip-set aria-label="OpenVidu Edition">
					<mat-chip [disableRipple]="true">PRO</mat-chip>
				</mat-chip-set>
			</div>
		</ov-base-card>
	`,
	styles: `
		.pro-feature-card {
			cursor: pointer;
		}

		::ng-deep .mat-mdc-standard-chip:not(.mdc-evolution-chip--disabled) {
			background-color: #077692 !important;
			border-radius: 8px;
			border: 1px solid #077692;
		}
		::ng-deep .mat-mdc-standard-chip:not(.mdc-evolution-chip--disabled) .mdc-evolution-chip__text-label {
			color: #ffffff !important;
			font-weight: bold;
		}
	`
})
export class ProFeatureCardComponent extends BaseCardComponent {
	constructor(
		cdr: ChangeDetectorRef,
		private notificationService: NotificationService
	) {
		super(cdr);
	}

	showDialog() {
		this.notificationService.showDialog({
			title: 'Upgrade to OpenVidu PRO',
			message:
				'Unlock this feature by upgrading to a Pro account. You can upgrade your account and start using this feature.',
			confirmText: 'Upgrade to Pro',
			cancelText: 'Cancel',
			confirmCallback: this.goToOpenVidu.bind(this)
		});
	}
	goToOpenVidu() {
		window.open('https://openvidu.io/pricing/', '_blank');
	}
}
