import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DevelopersSettingsComponent } from './developers.component';

describe('AccessPermissionsComponent', () => {
  let component: DevelopersSettingsComponent;
  let fixture: ComponentFixture<DevelopersSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevelopersSettingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DevelopersSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
