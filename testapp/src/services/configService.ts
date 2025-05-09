import dotenv from 'dotenv';

dotenv.config();

export class ConfigService {
  public meetApiUrl: string;
  public apiKey: string;
  public port: number;

  constructor() {
    this.meetApiUrl = process.env.OPENVIDU_MEET_URL || 'http://localhost:6080/meet/api/v1';
    this.apiKey = process.env.API_KEY || 'meet-api-key';
    this.port = parseInt(process.env.PORT || '5080', 10);
  }
}

export const configService = new ConfigService();