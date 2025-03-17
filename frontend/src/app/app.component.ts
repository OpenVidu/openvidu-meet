import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ContextService } from 'shared-meet-components';
import packageInfo from '../../package.json';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	standalone: true,
	imports: [RouterOutlet]
})
export class AppComponent implements OnInit {
	constructor(private contextService: ContextService) {}

	ngOnInit() {
		this.contextService.setVersion(packageInfo.version);
		this.contextService.setOpenViduLogoUrl('assets/images/openvidu_logo.png');
		this.contextService.setBackgroundImageUrl('/assets/images/bg.webp');
	}
}
