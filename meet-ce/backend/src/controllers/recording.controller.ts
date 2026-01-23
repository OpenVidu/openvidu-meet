import { MeetRecordingInfo } from '@openvidu-meet/typings';
import archiver from 'archiver';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	errorRecordingsZipEmpty,
	handleError,
	internalError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RecordingService } from '../services/recording.service.js';
import { getBaseUrl } from '../utils/url.utils.js';

export const startRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const { roomId } = req.body;
	logger.info(`Starting recording in room '${roomId}'`);

	try {
		const recordingInfo = await recordingService.startRecording(roomId);
		res.setHeader(
			'Location',
			`${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingInfo.recordingId}`
		);

		return res.status(201).json(recordingInfo);
	} catch (error) {
		handleError(res, error, `starting recording in room '${roomId}'`);
	}
};

export const stopRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingId = req.params.recordingId;

	try {
		logger.info(`Stopping recording '${recordingId}'`);
		const recordingService = container.get(RecordingService);

		const recordingInfo = await recordingService.stopRecording(recordingId);
		res.setHeader('Location', `${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`);
		return res.status(202).json(recordingInfo);
	} catch (error) {
		handleError(res, error, `stopping recording '${recordingId}'`);
	}
};

export const getRecordings = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const queryParams = req.query;

	logger.info('Getting all recordings');

	try {
		const { recordings, isTruncated, nextPageToken } = await recordingService.getAllRecordings(queryParams);
		const maxItems = Number(queryParams.maxItems);

		return res.status(200).json({
			recordings,
			pagination: {
				isTruncated,
				nextPageToken,
				maxItems
			}
		});
	} catch (error) {
		handleError(res, error, 'getting recordings');
	}
};

export const bulkDeleteRecordings = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const { recordingIds } = req.query as { recordingIds: string[] };

	logger.info(`Deleting recordings: ${recordingIds}`);

	try {
		const { deleted, failed } = await recordingService.bulkDeleteRecordings(recordingIds);

		// All recordings were successfully deleted
		if (deleted.length > 0 && failed.length === 0) {
			return res.status(200).json({ message: 'All recordings deleted successfully', deleted });
		}

		// Some or all recordings could not be deleted
		return res.status(400).json({ message: `${failed.length} recording(s) could not be deleted`, deleted, failed });
	} catch (error) {
		handleError(res, error, 'deleting recordings');
	}
};

export const getRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	const fields = req.query.fields as string | undefined;

	logger.info(`Getting recording '${recordingId}'`);

	try {
		const recordingInfo = await recordingService.getRecording(recordingId, fields);
		return res.status(200).json(recordingInfo);
	} catch (error) {
		handleError(res, error, `getting recording '${recordingId}'`);
	}
};

export const deleteRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	logger.info(`Deleting recording '${recordingId}'`);

	try {
		await recordingService.deleteRecording(recordingId);
		return res.status(200).json({ message: `Recording '${recordingId}' deleted successfully` });
	} catch (error) {
		handleError(res, error, `deleting recording '${recordingId}'`);
	}
};

/**
 * Get recording media
 *
 * This controller endpoint retrieves a recording by its ID and streams it as a video/mp4 file.
 * It supports HTTP range requests, allowing for features like video seeking and partial downloads.
 *
 */
export const getRecordingMedia = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	const recordingId = req.params.recordingId;
	const range = req.headers.range;
	let fileStream: Readable | undefined;

	try {
		logger.info(`Streaming recording '${recordingId}'`);
		const recordingService = container.get(RecordingService);

		const result = await recordingService.getRecordingAsStream(recordingId, range);
		const { fileSize, start, end } = result;
		fileStream = result.fileStream;

		fileStream.on('error', (streamError) => {
			logger.error(`Error streaming recording '${recordingId}': ${streamError.message}`);

			if (!res.headersSent) {
				const error = internalError(`streaming recording '${recordingId}'`);
				rejectRequestFromMeetError(res, error);
			}

			res.end();
		});

		// Handle client disconnection
		req.on('close', () => {
			if (fileStream && !fileStream.destroyed) {
				logger.debug(`Client closed connection for recording media '${recordingId}'`);
				fileStream.destroy();
			}
		});

		// Handle partial requests (HTTP Range requests)
		if (range && fileSize && start !== undefined && end !== undefined) {
			const contentLength = end - start + 1;

			// Set headers for partial content response
			res.writeHead(206, {
				'Content-Range': `bytes ${start}-${end}/${fileSize}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': contentLength,
				'Content-Type': 'video/mp4',
				'Cache-Control': 'public, max-age=3600'
			});
		} else {
			// Set headers for full content response
			res.writeHead(200, {
				'Accept-Ranges': 'bytes',
				'Content-Type': 'video/mp4',
				'Content-Length': fileSize || undefined,
				'Cache-Control': 'public, max-age=3600'
			});
		}

		fileStream
			.pipe(res)
			.on('finish', () => {
				logger.debug(`Finished streaming recording '${recordingId}'`);
				res.end();
			})
			.on('error', (err) => {
				logger.error(`Error in response stream for recording '${recordingId}': ${err.message}`);

				if (!res.headersSent) {
					res.status(500).end();
				}
			});
	} catch (error) {
		if (fileStream && !fileStream.destroyed) {
			fileStream.destroy();
		}

		handleError(res, error, `streaming recording '${recordingId}'`);
	}
};

export const getRecordingUrl = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	const privateAccess = req.query.privateAccess === 'true';

	logger.info(`Getting URL for recording '${recordingId}'`);

	try {
		const recordingSecrets = await recordingService.getRecordingAccessSecrets(recordingId);
		const secret = privateAccess ? recordingSecrets.privateAccessSecret : recordingSecrets.publicAccessSecret;
		const recordingUrl = `${getBaseUrl()}/recording/${recordingId}?secret=${secret}`;

		return res.status(200).json({ url: recordingUrl });
	} catch (error) {
		handleError(res, error, `getting URL for recording '${recordingId}'`);
	}
};

export const downloadRecordingsZip = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);

	const { recordingIds } = req.query as { recordingIds: string[] };
	const validRecordings: MeetRecordingInfo[] = [];

	logger.info(`Preparing ZIP download for recordings: ${recordingIds}`);

	// Validate each recording: first check existence, then permissions
	for (const recordingId of recordingIds) {
		try {
			const recordingInfo = await recordingService.validateRecordingAccess(recordingId, 'canRetrieveRecordings');
			validRecordings.push(recordingInfo);
		} catch (error) {
			logger.warn(`Skipping recording '${recordingId}' for ZIP`);
		}
	}

	if (validRecordings.length === 0) {
		logger.error(`None of the provided recording IDs are available for ZIP download`);
		const error = errorRecordingsZipEmpty();
		return rejectRequestFromMeetError(res, error);
	}

	res.setHeader('Content-Type', 'application/zip');
	res.setHeader('Content-Disposition', 'attachment; filename="recordings.zip"');

	const archive = archiver('zip', { zlib: { level: 0 } });

	// Handle errors in the archive
	archive.on('error', (err) => {
		logger.error(`ZIP archive error: ${err.message}`);
		res.status(500).end();
	});

	// Pipe the archive to the response
	archive.pipe(res);

	for (const recording of validRecordings) {
		const recordingId = recording.recordingId;

		try {
			logger.debug(`Adding recording '${recordingId}' to ZIP`);
			const result = await recordingService.getRecordingAsStream(recordingId);

			const filename = recording.filename || `${recordingId}.mp4`;
			archive.append(result.fileStream, { name: filename });
		} catch (error) {
			logger.error(`Error adding recording '${recordingId}' to ZIP: ${error}`);
		}
	}

	// Finalize the archive
	archive.finalize();
};
