import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import path from 'path';
import {
	getHome,
	postCreateRoom,
	deleteRoomCtrl,
	deleteAllRoomsCtrl,
	deleteAllRecordingsCtrl,
} from './controllers/homeController';
import { handleWebhook, joinRoom } from './controllers/roomController';
import { configService } from './services/configService';

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
app.get('/room', joinRoom);
app.post('/room', postCreateRoom);
app.post('/room/delete', deleteRoomCtrl);
app.post('/delete-all-rooms', deleteAllRoomsCtrl);
app.post('/delete-all-recordings', deleteAllRecordingsCtrl);
app.post('/join-room', joinRoom);
app.post('/webhook', (req, res) => {
	handleWebhook(req, res, io);
});

const PORT = configService.port;
server.listen(PORT, () => {
	console.log('-----------------------------------------');
	console.log(`Server running on port ${PORT}`);
	console.log(`Meet API URL: ${configService.meetApiUrl}`);
	console.log('-----------------------------------------');
	console.log('');
	console.log(`Visit http://localhost:${PORT}/ to access the app`);
});
