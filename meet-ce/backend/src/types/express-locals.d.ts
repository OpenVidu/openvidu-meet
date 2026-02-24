declare global {
	namespace Express {
		interface Locals {
			validatedQuery?: Record<string, unknown>;
		}
	}
}

export {};
