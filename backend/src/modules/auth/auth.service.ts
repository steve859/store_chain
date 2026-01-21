import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import prisma from '../../db/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

export const login = async (email: string, password: string) => {
  // Cho phép login bằng email hoặc username (frontend đang dùng email)
  const user = await prisma.users.findFirst({
    where: {
      OR: [{ email }, { username: email }],
      is_active: true,
    },
    include: { roles: true, stores: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  // 3. Tạo JWT Token
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.roles?.name,
    storeId: user.store_id,
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1d' });

  return {
    token,
    user: {
      id: user.id,
      name: user.full_name,
      username: user.username,
      email: user.email,
      role: user.roles?.name,
      storeId: user.store_id,
    }
  };
};