import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { del, get } from '../utils/http';
import { configService } from './configService';

export const getAllRecordings = async (): Promise<MeetRecordingInfo[]> => {
	const url = `${configService.meetApiUrl}/recordings`;

	try {
		const recordings: MeetRecordingInfo[] = [];
		let pageUrl = url;
		let pagination: { isTruncated: boolean; nextPageToken?: string };

		do {
			const result = await get<{
				pagination: { isTruncated: boolean; nextPageToken?: string };
				recordings: MeetRecordingInfo[];
			}>(pageUrl, {
				headers: { 'x-api-key': configService.meetApiKey }
			});
			recordings.push(...result.recordings);
			pagination = result.pagination;
			console.log(
				`Fetched ${result.recordings.length} recordings, total: ${recordings.length}, isTruncated: ${pagination.isTruncated}`
			);
			pageUrl = `${url}?nextPageToken=${pagination.nextPageToken}`;
		} while (pagination.isTruncated);

		console.log(`Successfully fetched total of ${recordings.length} recordings`);
		return recordings;
	} catch (error) {
		console.error('Error fetching all recordings:', error);
		throw error;
	}
};

export const deleteAllRecordings = async (recordingIds: string[]): Promise<void> => {
	const url = `${configService.meetApiUrl}/recordings?recordingIds=${recordingIds.join(',')}`;
	return del<void>(url, {
		headers: { 'x-api-key': configService.meetApiKey }
	});
};
