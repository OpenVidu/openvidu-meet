import dotenv from 'dotenv';

dotenv.config();

export class ConfigService {
    public serverPort: number;
    public meetApiUrl: string;
    public meetApiKey: string;
    public meetWebhookSrc: string;

    constructor() {
        this.serverPort = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 5080;
        this.meetApiUrl = process.env.MEET_API_URL || 'http://localhost:6080/api/v1';
        this.meetApiKey = process.env.MEET_API_KEY || 'meet-api-key';
        this.meetWebhookSrc = process.env.MEET_WEBCOMPONENT_SRC || 'http://localhost:6080/v1/openvidu-meet.js';
    }
}

export const configService = new ConfigService();
