import type { JwtPayload } from 'jsonwebtoken';

export type AuthUserPayload = JwtPayload & {
  userId: number;
  email: string | null;
  role: string | null;
  // Backward compatibility
  storeId?: number | null;
  // New multi-store
  storeIds?: number[];
  primaryStoreId?: number | null;
};
