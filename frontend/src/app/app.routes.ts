import { Routes } from '@angular/router';
import { HomeComponent } from '@app/pages/home/home.component';
import { baseRoutes } from 'projects/shared-meet-components/src/public-api';

export const routes: Routes = [{ path: '', component: HomeComponent }, ...baseRoutes];
