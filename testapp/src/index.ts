import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as IOServer } from 'socket.io';
import {
    deleteAllRecordingsCtrl,
    deleteAllRoomsCtrl,
    deleteRoomCtrl,
    getHome,
    postCreateRoom
} from './controllers/homeController';
import { handleWebhook, joinRoom } from './controllers/roomController';
import { configService } from './services/configService';

// Setup log file for CI debugging
const logStream = fs.createWriteStream(path.join(__dirname, '../../testapp.log'), { flags: 'a' });

// Override console methods to also write to log file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] LOG: ${message}\n`);
    originalConsoleLog.apply(console, args);
};

console.error = (...args: any[]) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ERROR: ${message}\n`);
    originalConsoleError.apply(console, args);
};

console.warn = (...args: any[]) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] WARN: ${message}\n`);
    originalConsoleWarn.apply(console, args);
};

console.log('=== TESTAPP STARTUP ===');
console.log('Testapp initializing at:', new Date().toISOString());
console.log('Environment variables:');
console.log('MEET_API_URL:', process.env.MEET_API_URL);
console.log('MEET_API_KEY:', process.env.MEET_API_KEY ? '***SET***' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

const app = express();
const server = http.createServer(app);
const io = new IOServer(server);

// View engine setup
app.engine('mustache', require('mustache-express')());
app.set('views', path.join(__dirname, '../public/views'));
app.set('view engine', 'mustache');

// Static assets
app.use(express.static(path.join(__dirname, '../public')));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));

app.use(express.json());

// Routes
app.get('/', getHome);
app.post('/room', postCreateRoom);
app.post('/room/delete', deleteRoomCtrl);
app.post('/delete-all-rooms', deleteAllRoomsCtrl);
app.post('/delete-all-recordings', deleteAllRecordingsCtrl);
app.post('/join-room', joinRoom);
app.post('/webhook', (req, res) => {
    handleWebhook(req, res, io);
});

const PORT = configService.serverPort;
server.listen(PORT, () => {
    console.log('-----------------------------------------');
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}/ to access the app`);
    console.log('-----------------------------------------');
    console.log('Configuration:');
    console.log(`  MEET_API_URL: ${configService.meetApiUrl}`);
    console.log(`  MEET_API_KEY: ${configService.meetApiKey ? '[SET]' : '[NOT SET]'}`);
    console.log(`  MEET_WEBCOMPONENT_SRC: ${configService.meetWebhookSrc}`);
    console.log(`  SERVER_PORT: ${configService.serverPort}`);
    console.log('-----------------------------------------');
    console.log('');

    console.log('OpenVidu Meet Configuration:');
    console.log(`Meet API URL: ${configService.meetApiUrl}`);
    console.log(`Meet API key: ${configService.meetApiKey}`);
    console.log(`Meet Webcomponent Source: ${configService.meetWebhookSrc}`);
    console.log('=== TESTAPP STARTUP COMPLETE ===');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('=== TESTAPP SHUTDOWN ===');
    console.log('Received SIGTERM, shutting down gracefully');
    logStream.end();
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('=== TESTAPP SHUTDOWN ===');
    console.log('Received SIGINT, shutting down gracefully');
    logStream.end();
    server.close(() => {
        process.exit(0);
    });
});
