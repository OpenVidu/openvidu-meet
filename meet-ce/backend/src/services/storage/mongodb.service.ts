import { inject, injectable } from 'inversify';
import mongoose from 'mongoose';
import { environment, MEET_MONGO_DB_NAME } from '../../environment.js';
import { LoggerService } from '../index.js';

/**
 * Service responsible for managing MongoDB connection lifecycle.
 * Handles connection, disconnection, and health checks for the MongoDB database.
 */
@injectable()
export class MongoDBService {
	private isConnected = false;
	private readonly connectionString: string;
	private readonly dbName: string;

	constructor(@inject(LoggerService) private logger: LoggerService) {
		this.connectionString = this.buildMongoConnectionString();
		this.dbName = MEET_MONGO_DB_NAME;
	}

	/**
	 * Builds MongoDB connection string from environment variables.
	 * Supports both single-node and replica set configurations.
	 *
	 * The `directConnection=true` parameter is only added for single-node connections
	 * to prevent the driver from attempting to discover other replica set members.
	 * In multi-node setups, it's omitted to enable automatic failover and load distribution.
	 *
	 * @returns MongoDB connection URI
	 */
	private buildMongoConnectionString(): string {
		const {
			MEET_MONGO_URI: mongoUri,
			MEET_MONGO_NODES: nodes,
			MEET_MONGO_PORT: port,
			MEET_MONGO_ADMIN_USERNAME: adminUser,
			MEET_MONGO_ADMIN_PASSWORD: adminPass,
			MEET_MONGO_REPLICA_SET_NAME: replicaSet
		} = environment;

		if (mongoUri && mongoUri.trim() !== '') {
			this.logger.info('Using provided MongoDB URI from environment variable MEET_MONGO_URI');
			return mongoUri;
		}

		// Parse nodes and build host list
		const nodesList = nodes.split(',').map((node) => node.trim());
		const nodesAndPort = nodesList.map((node) => `${node}:${port}`).join(',');

		let connectionString = `mongodb://${adminUser}:${adminPass}@${nodesAndPort}/?replicaSet=${replicaSet}&readPreference=primaryPreferred`;

		// Add directConnection=true for single-node local connections
		const isLocalhost = nodesList.length === 1 && (nodesList[0] === 'localhost' || nodesList[0] === '127.0.0.1');

		if (isLocalhost) {
			connectionString += '&directConnection=true';
		}

		return connectionString;
	}

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
			this.logger.info(`Connecting to MongoDB (database: ${this.dbName})...`);
			await mongoose.connect(this.connectionString, {
				dbName: this.dbName
			});
			this.isConnected = true;
			this.logger.info(`Successfully connected to MongoDB (database: ${this.dbName})`);

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
