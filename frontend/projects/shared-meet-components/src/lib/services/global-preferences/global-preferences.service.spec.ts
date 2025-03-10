import { TestBed } from '@angular/core/testing';

import { GlobalPreferencesService } from './global-preferences.service';

describe('GlobalPreferencesService', () => {
  let service: GlobalPreferencesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GlobalPreferencesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
