// Dev-server proxy for the WebComponent testapp.
//
// Port/base-path-agnostic by design: the host page (src/index.html) loads the
// WebComponent bundle and talks to the webhook bridge through SAME-ORIGIN
// paths, and this proxy forwards them to the real services. Override the
// targets via env vars instead of hardcoding ports anywhere in the app.
//
//   MEET_API_URL            backend base URL incl. base path
//                           (default http://localhost:6080/meet)
//   MEET_WEBHOOK_BRIDGE_URL local webhook bridge (default http://localhost:5081)

const { URL } = require('url');

const meetApiUrl = process.env.MEET_API_URL || 'http://localhost:6080/meet';
const backend = new URL(meetApiUrl);
const backendOrigin = backend.origin; // e.g. http://localhost:6080
const backendBasePath = backend.pathname.replace(/\/+$/, ''); // '' or '/meet'

const bridge = process.env.MEET_WEBHOOK_BRIDGE_URL || 'http://localhost:8080';

module.exports = {
	// The WebComponent bundle is served by the backend at
	// `<basePath>/v1/openvidu-meet.js`. Forward the same-origin shortcut there.
	'/openvidu-meet.js': {
		target: backendOrigin,
		changeOrigin: true,
		secure: false,
		pathRewrite: { '^/openvidu-meet.js': `${backendBasePath}/v1/openvidu-meet.js` },
		logLevel: 'warn'
	},
	'/webhook': {
		target: bridge,
		secure: false,
		changeOrigin: true,
		logLevel: 'warn'
	},
	'/socket.io': {
		target: bridge,
		secure: false,
		changeOrigin: true,
		ws: true,
		logLevel: 'warn'
	}
};
