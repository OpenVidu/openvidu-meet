import dotenv from 'dotenv';

dotenv.config();

export class ConfigService {
    public meetApiUrl: string;
    public meetApiKey: string;
    public serverPort: number;

    constructor() {
        this.meetApiUrl = process.env.OPENVIDU_MEET_URL!;
        this.meetApiKey = process.env.MEET_API_KEY!;
        this.serverPort = parseInt(process.env.PORT!, 10);
    }
}

export const configService = new ConfigService();
