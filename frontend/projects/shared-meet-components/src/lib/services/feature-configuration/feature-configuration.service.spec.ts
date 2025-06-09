import { TestBed } from '@angular/core/testing';
import { FeatureConfigurationService } from './feature-configuration.service';

describe('FeatureConfigurationService', () => {
	let service: FeatureConfigurationService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(FeatureConfigurationService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
