import { Request, Response } from 'express';
import { Readable } from 'stream';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import {
	errorRecordingNotFound,
	handleError,
	internalError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService, MeetStorageService, RecordingService } from '../services/index.js';

export const startRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const { roomId } = req.body;
	logger.info(`Starting recording in room '${roomId}'`);

	try {
		const recordingInfo = await recordingService.startRecording(roomId);
		res.setHeader(
			'Location',
			`${req.protocol}://${req.get('host')}${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingInfo.recordingId}`
		);

		return res.status(201).json(recordingInfo);
	} catch (error) {
		handleError(res, error, `starting recording in room '${roomId}'`);
	}
};

export const getRecordings = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const queryParams = req.query;

	// If recording token is present, retrieve only recordings for the room associated with the token
	const payload = req.session?.tokenClaims;

	if (payload && payload.video) {
		const roomId = payload.video.room;
		queryParams.roomId = roomId;
		logger.info(`Getting recordings for room '${roomId}'`);
	} else {
		logger.info('Getting all recordings');
	}

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
	const { recordingIds } = req.query;

	logger.info(`Deleting recordings: ${recordingIds}`);

	try {
		// TODO: Check role to determine if the request is from an admin or a participant
		const recordingIdsArray = (recordingIds as string).split(',');
		const { deleted, notDeleted } =
			await recordingService.bulkDeleteRecordingsAndAssociatedFiles(recordingIdsArray);

		// All recordings were successfully deleted
		if (deleted.length > 0 && notDeleted.length === 0) {
			return res.sendStatus(204);
		}

		// Some or all recordings could not be deleted
		return res.status(200).json({ deleted, notDeleted });
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

export const stopRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingId = req.params.recordingId;

	try {
		logger.info(`Stopping recording '${recordingId}'`);
		const recordingService = container.get(RecordingService);

		const recordingInfo = await recordingService.stopRecording(recordingId);
		res.setHeader(
			'Location',
			`${req.protocol}://${req.get('host')}${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`
		);
		return res.status(202).json(recordingInfo);
	} catch (error) {
		handleError(res, error, `stopping recording '${recordingId}'`);
	}
};

export const deleteRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	logger.info(`Deleting recording '${recordingId}'`);

	try {
		// TODO: Check role to determine if the request is from an admin or a participant
		await recordingService.deleteRecording(recordingId);
		return res.status(204).send();
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
	const recordingId = req.params.recordingId;
	const privateAccess = req.query.privateAccess === 'true';

	logger.info(`Getting URL for recording '${recordingId}'`);

	try {
		const storageService = container.get(MeetStorageService);
		const recordingSecrets = await storageService.getAccessRecordingSecrets(recordingId);

		if (!recordingSecrets) {
			const error = errorRecordingNotFound(recordingId);
			return rejectRequestFromMeetError(res, error);
		}

		const secret = privateAccess ? recordingSecrets.privateAccessSecret : recordingSecrets.publicAccessSecret;
		const recordingUrl = `${req.protocol}://${req.get('host')}/recording/${recordingId}?secret=${secret}`;

		return res.status(200).json({ url: recordingUrl });
	} catch (error) {
		handleError(res, error, `getting URL for recording '${recordingId}'`);
	}
};
