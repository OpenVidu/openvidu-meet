import { TestBed } from '@angular/core/testing';

import { RecordingManagerService } from './recording-manager.service';

describe('RecordingManagerService', () => {
  let service: RecordingManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RecordingManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
