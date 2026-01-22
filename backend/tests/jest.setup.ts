process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

// Prevent Prisma bootstrap from throwing on import.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/store_chain';

// Use a stable secret for token signing in tests.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
