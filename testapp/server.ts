import dotenv from 'dotenv';
import express from 'express';
import mustacheExpress from 'mustache-express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import controllers
import { joinRoom, handleWebhook } from './src/controllers/videoRoomController.js';
import { createRoom, renderHomePage } from './src/controllers/homeController.js';
import { ConfigService } from './src/services/config.service.js';
import { Logger } from './src/utils/logger.js';

// Initialize logger
const logger = new Logger('Server');

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define project root (going up from the dist folder if we're running the compiled version)
const projectRoot =
  process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '..') // In production, dist/server.js is 1 level down
    : __dirname; // In development, we're in the project root

// Initialize environment variables
dotenv.config();
logger.info('Environment variables loaded');

// Get configuration
const config = ConfigService.getInstance();

// Setup Express and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure view engine and middleware
app.engine('mustache', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', path.join(projectRoot, 'public/views'));
app.use(express.static(path.join(projectRoot, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
logger.debug('Express middleware configured');
logger.debug(`Static directory: ${path.join(projectRoot, 'public')}`);
logger.debug(`Views directory: ${path.join(projectRoot, 'public/views')}`);

// Define routes
app.get('/', renderHomePage);
app.post('/room', createRoom);
app.post('/join-room', joinRoom);
app.post('/webhook', (req, res) => {
  handleWebhook(req, res, io);
});

// Socket.IO connection handler
io.on('connection', socket => {
  logger.info(`New socket connection: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = config.port;
server.listen(PORT, () => {
  logger.info(`Server started successfully on http://localhost:${PORT}`);
});
