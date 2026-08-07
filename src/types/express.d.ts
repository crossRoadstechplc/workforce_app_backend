declare global { namespace Express { interface Request { id: string; auth?: { userId: string; roles: string[]; permissions: string[]; restricted: boolean }; } } }
export {};
