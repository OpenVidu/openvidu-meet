// This file is required by karma.conf.js and loads recursively all the .spec and framework files
// The app runs zoneless (see app.config.ts); the test environment therefore loads no zone.js polyfill.

import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
