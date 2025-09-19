import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetStorageService } from '../../../../src/services/index.js';
import { MeetRoomThemeMode } from '../../../../src/typings/ce/index.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getRoomsAppearanceConfig,
	startTestServer,
	updateRoomsAppearanceConfig
} from '../../../helpers/request-helpers.js';

describe('Rooms Appearance Config API Tests', () => {
	beforeAll(async () => {
		startTestServer();
	});

	afterEach(async () => {
		const storageService = container.get(MeetStorageService);
		await storageService['initializeGlobalConfig']();
	});

	describe('Update rooms appearance config', () => {
		it('should update rooms appearance config with valid complete data', async () => {
			const validConfig = {
				appearance: {
					themes: [
						{
							name: 'Custom Theme',
							baseTheme: MeetRoomThemeMode.DARK,
							backgroundColor: '#121212',
							primaryColor: '#bb86fc',
							secondaryColor: '#03dac6',
							surfaceColor: '#1f1f1f'
						}
					]
				}
			};

			let response = await updateRoomsAppearanceConfig(validConfig);
			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Rooms appearance config updated successfully');

			response = await getRoomsAppearanceConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(validConfig);
		});

		it('should update rooms appearance config with minimal required data', async () => {
			const validConfig = {
				appearance: {
					themes: [
						{
							name: 'Minimal Theme',
							baseTheme: MeetRoomThemeMode.LIGHT
						}
					]
				}
			};

			let response = await updateRoomsAppearanceConfig(validConfig);
			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Rooms appearance config updated successfully');

			response = await getRoomsAppearanceConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(validConfig);
		});

		it('should replace existing config when updating', async () => {
			const initialConfig = {
				appearance: {
					themes: [
						{
							name: 'Initial Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							primaryColor: '#1976d2'
						}
					]
				}
			};

			let response = await updateRoomsAppearanceConfig(initialConfig);
			expect(response.status).toBe(200);

			response = await getRoomsAppearanceConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(initialConfig);

			const newConfig = {
				appearance: {
					themes: [
						{
							name: 'New Theme',
							baseTheme: MeetRoomThemeMode.DARK,
							primaryColor: '#bb86fc'
						}
					]
				}
			};

			response = await updateRoomsAppearanceConfig(newConfig);
			expect(response.status).toBe(200);

			response = await getRoomsAppearanceConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(newConfig);
		});
	});

	describe('Update rooms appearance config validation', () => {
		it('should reject when themes array is empty', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: []
				}
			});

			expectValidationError(response, 'appearance.themes', 'There must be exactly one theme defined');
		});

		it('should reject when themes array has more than one theme', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Theme 1',
							baseTheme: MeetRoomThemeMode.LIGHT
						},
						{
							name: 'Theme 2',
							baseTheme: MeetRoomThemeMode.DARK
						}
					]
				}
			});

			expectValidationError(response, 'appearance.themes', 'There must be exactly one theme defined');
		});

		it('should reject when theme name is empty', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: '',
							baseTheme: MeetRoomThemeMode.LIGHT
						}
					]
				}
			});

			expectValidationError(response, 'appearance.themes.0.name', 'Theme name cannot be empty');
		});

		it('should reject when theme name exceeds 50 characters', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'This is a very long theme name that exceeds fifty characters',
							baseTheme: MeetRoomThemeMode.LIGHT
						}
					]
				}
			});

			expectValidationError(response, 'appearance.themes.0.name', 'Theme name cannot exceed 50 characters');
		});

		it('should reject when baseTheme is not a valid enum value', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Invalid Theme',
							baseTheme: 'invalid'
						}
					]
				}
			});

			expectValidationError(
				response,
				'appearance.themes.0.baseTheme',
				"Invalid enum value. Expected 'light' | 'dark', received 'invalid'"
			);
		});

		it('should reject when hex colors are invalid', async () => {
			let response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Invalid Color Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							backgroundColor: 'not-a-color'
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.backgroundColor', 'Must be a valid hex color code');

			response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Invalid Color Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							primaryColor: '#gggggg'
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.primaryColor', 'Must be a valid hex color code');

			response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Invalid Color Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							secondaryColor: '#12345'
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.secondaryColor', 'Must be a valid hex color code');

			response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Invalid Color Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							surfaceColor: 'rgb(255,255,255)'
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.surfaceColor', 'Must be a valid hex color code');
		});

		it('should accept valid 3-digit hex colors', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Short Hex Theme',
							baseTheme: MeetRoomThemeMode.LIGHT,
							backgroundColor: '#fff',
							primaryColor: '#000',
							secondaryColor: '#f0f',
							surfaceColor: '#abc'
						}
					]
				}
			});

			expect(response.status).toBe(200);
		});

		it('should reject when name or baseTheme are not provided', async () => {
			let response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							baseTheme: MeetRoomThemeMode.LIGHT
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.name', 'Required');

			response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: [
						{
							name: 'Missing Base Theme'
						}
					]
				}
			});
			expectValidationError(response, 'appearance.themes.0.baseTheme', 'Required');
		});

		it('should reject when appearance is not an object', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: 'invalid'
			});

			expectValidationError(response, 'appearance', 'Expected object, received string');
		});

		it('should reject when themes is not an array', async () => {
			const response = await updateRoomsAppearanceConfig({
				appearance: {
					themes: 'invalid'
				}
			});

			expectValidationError(response, 'appearance.themes', 'Expected array, received string');
		});
	});

	describe('Get rooms appearance config', () => {
		it('should return 404 when no appearance config is set', async () => {
			const response = await getRoomsAppearanceConfig();

			expect(response.status).toBe(404);
			expect(response.body.message).toBe('Rooms appearance config not defined');
		});

		it('should return rooms appearance config when one is set', async () => {
			const configToSet = {
				appearance: {
					themes: [
						{
							name: 'Test Theme',
							baseTheme: MeetRoomThemeMode.DARK,
							primaryColor: '#bb86fc'
						}
					]
				}
			};
			let response = await updateRoomsAppearanceConfig(configToSet);
			expect(response.status).toBe(200);

			response = await getRoomsAppearanceConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(configToSet);
		});
	});
});
