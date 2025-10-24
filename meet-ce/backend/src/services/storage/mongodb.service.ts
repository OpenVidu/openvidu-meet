import { inject, injectable } from 'inversify';
import mongoose from 'mongoose';
import { MEET_MONGODB_DB_NAME, MEET_MONGODB_URI } from '../../environment.js';
import { LoggerService } from '../index.js';

/**
 * Service responsible for managing MongoDB connection lifecycle.
 * Handles connection, disconnection, and health checks for the MongoDB database.
 */
@injectable()
export class MongoDBService {
	private isConnected = false;

	constructor(@inject(LoggerService) private logger: LoggerService) {}

	/**
	 * Establishes connection to MongoDB database.
	 * @throws Error if connection fails
	 */
	async connect(): Promise<void> {
		if (this.isConnected) {
			this.logger.warn('MongoDB already connected, skipping connection attempt');
			return;
		}

		try {
			this.logger.info(`Connecting to MongoDB (database: ${MEET_MONGODB_DB_NAME})...`);
			await mongoose.connect(MEET_MONGODB_URI, {
				dbName: MEET_MONGODB_DB_NAME
			});
			this.isConnected = true;
			this.logger.info(`Successfully connected to MongoDB (database: ${MEET_MONGODB_DB_NAME})`);

			// Set up connection event listeners
			mongoose.connection.on('disconnected', () => {
				this.logger.warn('MongoDB disconnected');
				this.isConnected = false;
			});

			mongoose.connection.on('error', (error) => {
				this.logger.error('MongoDB connection error:', error);
			});

			mongoose.connection.on('reconnected', () => {
				this.logger.info('MongoDB reconnected');
				this.isConnected = true;
			});
		} catch (error) {
			this.logger.error('Failed to connect to MongoDB:', error);
			throw error;
		}
	}

	/**
	 * Closes the MongoDB connection gracefully.
	 */
	async disconnect(): Promise<void> {
		if (!this.isConnected) {
			this.logger.warn('MongoDB not connected, skipping disconnection');
			return;
		}

		try {
			await mongoose.disconnect();
			this.isConnected = false;
			this.logger.info('Disconnected from MongoDB');
		} catch (error) {
			this.logger.error('Error disconnecting from MongoDB:', error);
		}
	}

	/**
	 * Performs a health check on the MongoDB connection.
	 * Verifies both connection state and database accessibility.
	 * Terminates the process if MongoDB is not healthy.
	 */
	async checkHealth(): Promise<void> {
		try {
			// Check connection state
			if (mongoose.connection.readyState !== 1) {
				this.logger.error('MongoDB connection state is not ready:', mongoose.connection.readyState);
				this.logger.error('MongoDB is not healthy. Terminating application...');
				process.exit(1);
			}

			// Perform ping operation to verify database accessibility
			await mongoose.connection.db?.admin().ping();
			this.logger.info('MongoDB health check passed');
		} catch (error) {
			this.logger.error('MongoDB health check failed:', error);
			this.logger.error('MongoDB is not healthy. Terminating application...');
			process.exit(1);
		}
	}
}
