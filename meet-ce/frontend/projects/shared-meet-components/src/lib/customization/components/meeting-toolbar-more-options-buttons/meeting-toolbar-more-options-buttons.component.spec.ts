import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetingToolbarMoreOptionsButtonsComponent } from './meeting-toolbar-more-options-buttons.component';

describe('MeetingToolbarMoreOptionsButtonsComponent', () => {
  let component: MeetingToolbarMoreOptionsButtonsComponent;
  let fixture: ComponentFixture<MeetingToolbarMoreOptionsButtonsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetingToolbarMoreOptionsButtonsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetingToolbarMoreOptionsButtonsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
