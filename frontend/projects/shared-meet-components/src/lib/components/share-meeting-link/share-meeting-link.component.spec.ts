import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareMeetingLinkComponent } from './share-meeting-link.component';

describe('ShareMeetingLinkComponent', () => {
  let component: ShareMeetingLinkComponent;
  let fixture: ComponentFixture<ShareMeetingLinkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareMeetingLinkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShareMeetingLinkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
