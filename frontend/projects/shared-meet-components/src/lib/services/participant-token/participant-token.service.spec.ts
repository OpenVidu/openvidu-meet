import { TestBed } from '@angular/core/testing';

import { ParticipantTokenService } from './participant-token.service';

describe('ParticipantTokenService', () => {
  let service: ParticipantTokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ParticipantTokenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
