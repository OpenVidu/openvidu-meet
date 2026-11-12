import { afterAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { serveFrontendFiles } from '../../../src/middlewares/frontend-static.middleware.js';

describe('serveFrontendFiles', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-meet-frontend-'));
	const files = [
		'main-AB12cd_-.js',
		'chunk-zn-te8sR.js',
		'styles-QWERTY12.css',
		'favicon.ico',
		'assets/i18n/en.json',
		'assets/vendor/lib-ABCDEFGH.js'
	];

	for (const file of files) {
		fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
		fs.writeFileSync(path.join(directory, file), '{}');
	}

	const app = express().use(serveFrontendFiles(directory));

	afterAll(() => {
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it.each(['main-AB12cd_-.js', 'chunk-zn-te8sR.js', 'styles-QWERTY12.css'])(
		'lets the browser keep the content-hashed bundle %s without revalidating',
		async (file) => {
			const response = await request(app).get(`/${file}`);

			expect(response.status).toBe(200);
			expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
		}
	);

	it.each(['favicon.ico', 'assets/i18n/en.json', 'assets/vendor/lib-ABCDEFGH.js'])(
		'makes the browser revalidate %s, whose name does not change with its content',
		async (file) => {
			const response = await request(app).get(`/${file}`);

			expect(response.status).toBe(200);
			expect(response.headers['cache-control']).toBe('public, max-age=0');
		}
	);

	it('answers a revalidation of an unchanged file with 304', async () => {
		const { headers } = await request(app).get('/favicon.ico');
		const response = await request(app).get('/favicon.ico').set('If-None-Match', headers['etag']);

		expect(response.status).toBe(304);
	});
});
