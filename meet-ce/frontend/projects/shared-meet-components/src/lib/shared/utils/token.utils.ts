import { jwtDecode } from 'jwt-decode';

export const decodeToken = (token: string) => {
	checkIsJWTValid(token);
	const decodedToken: any = jwtDecode(token);
	decodedToken.metadata = JSON.parse(decodedToken.metadata);

	if (decodedToken.exp && Date.now() >= decodedToken.exp * 1000) {
		throw new Error('Token is expired. Please, request a new one');
	}

	return decodedToken;
};

const checkIsJWTValid = (token: string) => {
	if (!token || typeof token !== 'string') {
		throw new Error('Invalid token. Token must be a string');
	}

	const tokenParts = token.split('.');
	if (tokenParts.length !== 3) {
		throw new Error('Invalid token. Token must be a valid JWT');
	}
};
