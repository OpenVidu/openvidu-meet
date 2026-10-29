module.exports = function (config) {
	config.set({
		basePath: '',
		frameworks: ['jasmine', '@angular-devkit/build-angular'],
		plugins: [
			require('karma-jasmine'),
			require('karma-chrome-launcher'),
			require('karma-jasmine-html-reporter'),
			require('karma-coverage'),
			require('@angular-devkit/build-angular/plugins/karma')
		],
		client: {
			clearContext: false // Leave Jasmine Spec Runner output visible in browser
		},
		jasmineHtmlReporter: {
			suppressAll: true // Removes the duplicated traces
		},
		coverageReporter: {
			dir: require('path').join(__dirname, './coverage'),
			subdir: '.',
			reporters: [{ type: 'html' }, { type: 'text-summary' }]
		},
		reporters: ['progress', 'kjhtml'],
		port: 9876,
		colors: true,
		logLevel: config.LOG_INFO,
		autoWatch: true,
		browsers: ['Chrome'],
		customLaunchers: {
			// Headless Chrome for CI: no sandbox / shared-memory tweaks so it runs
			// inside containerized GitHub Actions runners. Select with
			// `ng test shared-meet-components --browsers=ChromeHeadlessCI`.
			// Audio contexts start suspended without a user gesture, which leaves microphone
			// level specs reading silence.
			ChromeHeadlessCI: {
				base: 'ChromeHeadless',
				flags: [
					'--no-sandbox',
					'--disable-gpu',
					'--disable-dev-shm-usage',
					'--autoplay-policy=no-user-gesture-required'
				]
			}
		},
		singleRun: false,
		restartOnFileChange: true,
	});
};
