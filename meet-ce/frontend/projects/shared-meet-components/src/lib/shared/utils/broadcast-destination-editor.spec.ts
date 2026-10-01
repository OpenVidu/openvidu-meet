import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormControl } from '@angular/forms';
import { DestinationEditor, rtmpUrlValidator, servedUrlValidator } from './broadcast-destination-editor';

const SERVED = 'rtmp://a.rtmp.youtube.com/live2/********';

describe('rtmpUrlValidator', () => {
	const errorsFor = (url: string) => new FormControl(url, { nonNullable: true, validators: rtmpUrlValidator }).errors;

	it('accepts rtmp and rtmps URLs, and leaves an empty value to the required check', () => {
		expect(errorsFor('rtmp://a.rtmp.youtube.com/live2/key')).toBeNull();
		expect(errorsFor(' rtmps://live.twitch.tv:443/app/key ')).toBeNull();
		expect(errorsFor('')).toBeNull();
	});

	it('rejects any other URL, and anything that is not one', () => {
		expect(errorsFor('https://youtube.com/live')).toEqual({ rtmpUrl: true });
		expect(errorsFor('not a url')).toEqual({ rtmpUrl: true });
	});
});

describe('servedUrlValidator', () => {
	const errorsFor = (url: string, served: string | undefined) =>
		new FormControl(url, { nonNullable: true, validators: servedUrlValidator(() => served) }).errors;

	it('accepts the redacted URL exactly as it was served, which keeps the saved stream key', () => {
		expect(errorsFor(SERVED, SERVED)).toBeNull();
	});

	it('accepts any full URL, which replaces the saved one', () => {
		expect(errorsFor('rtmp://other.example.com/live/new-key', SERVED)).toBeNull();
	});

	it('asks for the stream key when a redacted URL changes host, or has no saved URL behind it', () => {
		expect(errorsFor('rtmp://other.example.com/live2/********', SERVED)).toEqual({ streamKeyRequired: true });
		expect(errorsFor(SERVED, undefined)).toEqual({ streamKeyRequired: true });
	});
});

describe('DestinationEditor', () => {
	let editor: DestinationEditor;

	beforeEach(() => {
		editor = TestBed.runInInjectionContext(() => new DestinationEditor(TestBed.inject(FormBuilder)));
	});

	it('opens empty for a new destination and yields nothing until the fields are valid', () => {
		editor.open();

		expect(editor.submit()).toBeUndefined();
		expect(editor.form.controls.name.touched).toBeTrue();

		editor.form.setValue({ name: '  Main channel ', url: ' rtmp://a.rtmp.youtube.com/live2/key ' });

		expect(editor.submit()).toEqual({ name: 'Main channel', url: 'rtmp://a.rtmp.youtube.com/live2/key' });
	});

	it("shows the server's refusal of the URL until the URL is changed", () => {
		editor.open({ name: 'Sink', url: 'rtmp://a.rtmp.youtube.com/live2/key' });
		editor.rejectUrl('Two destinations stream to the same URL');

		expect(editor.form.controls.url.getError('rejected')).toBe('Two destinations stream to the same URL');
		expect(editor.submit()).toBeUndefined();

		editor.form.controls.url.setValue('rtmp://a.rtmp.youtube.com/live2/other-key');

		expect(editor.form.controls.url.hasError('rejected')).toBeFalse();
	});

	it('tells the platform of the URL as it is typed', () => {
		editor.open();
		editor.form.controls.url.setValue('rtmps://live.twitch.tv:443/app/key');

		expect(editor.platform()).toBe('twitch');
		expect(editor.platformLabel()).toBe('Twitch');
	});

	it('keeps the stream key of a saved destination echoed back as served, and asks for it otherwise', () => {
		editor.open({ name: 'YouTube', url: SERVED }, SERVED);

		expect(editor.keepsSavedKey()).toBeTrue();
		expect(editor.submit()).toEqual({ name: 'YouTube', url: SERVED });

		editor.form.controls.url.setValue('rtmp://other.example.com/live2/********');

		expect(editor.keepsSavedKey()).toBeFalse();
		expect(editor.submit()).toBeUndefined();
		expect(editor.form.controls.url.hasError('streamKeyRequired')).toBeTrue();
	});
});
