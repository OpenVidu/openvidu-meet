import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProFeatureBadgeComponent } from './pro-feature-badge.component';

describe('ProFeatureBadgeComponent', () => {
  let component: ProFeatureBadgeComponent;
  let fixture: ComponentFixture<ProFeatureBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProFeatureBadgeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProFeatureBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
