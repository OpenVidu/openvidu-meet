import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { RecordingService } from '../services/recording.service.js';
import { container } from '../config/dependency-injector.config.js';

export const startRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const { roomId } = req.body;
	logger.info(`Initiating recording for room ${roomId}`);

	try {
		const recordingInfo = await recordingService.startRecording(roomId);
		return res.status(200).json(recordingInfo);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error starting recording: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Failed to start recording' });
	}
};

export const getRecordings = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const queryParams = req.query;

	logger.verbose('Getting all recordings');

	try {
		const response = await recordingService.getAllRecordings(queryParams);
		return res.status(200).json(response);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error getting all recordings: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error getting recordings' });
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
		const { deleted, notDeleted } = await recordingService.bulkDeleteRecordings(recordingIdsArray);

		return res.status(200).json({ deleted, notDeleted });
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error deleting recordings: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error deleting recordings' });
	}
};

export const getRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	const fields = req.query.fields as string | undefined;

	logger.info(`Getting recording ${recordingId}`);

	try {
		const recordingInfo = await recordingService.getRecording(recordingId, fields);
		return res.status(200).json(recordingInfo);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error getting recording: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error getting recording' });
	}
};

export const stopRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingId = req.params.recordingId;

	try {
		logger.info(`Initiating stop for recording ${recordingId}`);
		const recordingService = container.get(RecordingService);

		const recordingInfo = await recordingService.stopRecording(recordingId);
		res.setHeader('Location', `${req.protocol}://${req.get('host')}${req.originalUrl}`);
		return res.status(202).json(recordingInfo);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error stopping recording: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error stopping recording' });
	}
};

export const deleteRecording = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const recordingService = container.get(RecordingService);
	const recordingId = req.params.recordingId;
	logger.info(`Deleting recording ${recordingId}`);

	try {
		// TODO: Check role to determine if the request is from an admin or a participant
		await recordingService.deleteRecording(recordingId);
		return res.status(204).send();
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error deleting recording: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error deleting recording' });
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

	try {
		logger.info(`Streaming recording ${recordingId}`);
		const recordingService = container.get(RecordingService);

		const { fileSize, fileStream, start, end } = await recordingService.getRecordingAsStream(recordingId, range);

		if (range && fileSize && start !== undefined && end !== undefined) {
			const contentLength = end - start + 1;

			res.writeHead(206, {
				'Content-Range': `bytes ${start}-${end}/${fileSize}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': contentLength,
				'Content-Type': 'video/mp4'
			});

			fileStream.on('error', (streamError) => {
				logger.error(`Error while streaming the file: ${streamError.message}`);
				res.end();
			});

			fileStream.pipe(res).on('finish', () => res.end());
		} else {
			res.setHeader('Accept-Ranges', 'bytes');
			res.setHeader('Content-Type', 'video/mp4');

			if (fileSize) res.setHeader('Content-Length', fileSize);

			fileStream.pipe(res).on('finish', () => res.end());
		}
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error streaming recording: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({ name: 'Recording Error', message: 'Unexpected error streaming recording' });
	}
};


// Internal Recording methods
