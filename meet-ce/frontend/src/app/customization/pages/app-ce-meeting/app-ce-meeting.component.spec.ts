import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppCeMeetingComponent } from './app-ce-meeting.component';

describe('AppCeMeetingComponent', () => {
  let component: AppCeMeetingComponent;
  let fixture: ComponentFixture<AppCeMeetingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppCeMeetingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppCeMeetingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
