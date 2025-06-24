import { del, get } from '../utils/http';
import { MeetRecordingInfo } from '../../../typings/src/recording.model';
import { configService } from './configService';

export const getAllRecordings = async (): Promise<{
	pagination: { isTruncated: boolean; nextPageToken?: string };
	recordings: MeetRecordingInfo[];
}> => {
	const url = `${configService.meetApiUrl}/recordings`;

	let { pagination, recordings } = await get<{
		pagination: any;
		recordings: MeetRecordingInfo[];
	}>(url, {
		headers: { 'x-api-key': configService.meetApiKey },
	});

	while (pagination.isTruncated) {
		const nextPageUrl = `${url}?nextPageToken=${pagination.nextPageToken}`;
		const nextPageResult = await get<{
			pagination: any;
			recordings: MeetRecordingInfo[];
		}>(nextPageUrl, {
			headers: { 'x-api-key': configService.meetApiKey },
		});
		recordings.push(...nextPageResult.recordings);
		pagination = nextPageResult.pagination;
	}
	return { pagination, recordings };
};

export const deleteAllRecordings = async (
	recordingIds: string[]
): Promise<void> => {
	const url = `${
		configService.meetApiUrl
	}/recordings?recordingIds=${recordingIds.join(',')}`;
	await del<void>(url, {
		headers: { 'x-api-key': configService.meetApiKey },
	});
};
