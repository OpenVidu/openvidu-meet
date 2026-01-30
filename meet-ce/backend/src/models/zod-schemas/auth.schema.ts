import { z } from 'zod';
import { TokenMetadata, TokenType } from '../token-metadata.model.js';

export const LoginReqSchema = z.object({
	userId: z.string().min(5, 'userId must be at least 5 characters long'),
	password: z.string().min(5, 'password must be at least 5 characters long')
});

export const TokenMetadataSchema: z.ZodType<TokenMetadata> = z.object({
	tokenType: z.nativeEnum(TokenType)
});
