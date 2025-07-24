import { del, get } from '../utils/http';
// @ts-ignore
import { MeetRecordingInfo } from '../../../typings/src/recording.model';
import { configService } from './configService';

export const getAllRecordings = async (): Promise<{
    pagination: { isTruncated: boolean; nextPageToken?: string };
    recordings: MeetRecordingInfo[];
}> => {
    const url = `${configService.meetApiUrl}/recordings`;
    console.log(`Fetching all recordings from: ${url}`);

    try {
        let { pagination, recordings } = await get<{
            pagination: any;
            recordings: MeetRecordingInfo[];
        }>(url, {
            headers: { 'x-api-key': configService.meetApiKey }
        });

        console.log(`Fetched initial page with ${recordings.length} recordings, isTruncated: ${pagination.isTruncated}`);

        while (pagination.isTruncated) {
            const nextPageUrl = `${url}?nextPageToken=${pagination.nextPageToken}`;
            console.log(`Fetching next page from: ${nextPageUrl}`);
            const nextPageResult = await get<{
                pagination: any;
                recordings: MeetRecordingInfo[];
            }>(nextPageUrl, {
                headers: { 'x-api-key': configService.meetApiKey }
            });
            recordings.push(...nextPageResult.recordings);
            pagination = nextPageResult.pagination;
            console.log(`Fetched additional ${nextPageResult.recordings.length} recordings, total: ${recordings.length}`);
        }

        console.log(`Successfully fetched total of ${recordings.length} recordings`);
        return { pagination, recordings };
    } catch (error) {
        console.error('Error fetching all recordings:', error);
        throw error;
    }
};

export const deleteAllRecordings = async (recordingIds: string[]): Promise<void> => {
    const url = `${configService.meetApiUrl}/recordings?recordingIds=${recordingIds.join(',')}`;
    console.log(`Deleting ${recordingIds.length} recordings from: ${url}`);
    console.log('Recording IDs to delete:', recordingIds);
    try {
        await del<void>(url, {
            headers: { 'x-api-key': configService.meetApiKey }
        });
        console.log(`Successfully deleted ${recordingIds.length} recordings`);
    } catch (error) {
        console.error(`Error deleting ${recordingIds.length} recordings:`, error);
        console.error('Recording IDs that failed:', recordingIds);
        throw error;
    }
};
