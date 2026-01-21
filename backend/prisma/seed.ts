import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is missing. Please check your .env file');
}

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

async function main() {
  console.log('🌱 Starting seeding...');
  
  // 1. Tạo Role Admin
  // LƯU Ý: Phải đảm bảo file schema.prisma đã có trường description cho model Role
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { 
      name: 'admin',
      description: 'Quản trị viên hệ thống' // <-- Trường mới thêm
    },
  });
  console.log(`✅ Role created: ${adminRole.name}`);

  // 2. Tạo User Admin
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@storechain.com' },
    update: {},
    create: {
      email: 'admin@storechain.com',
      name: 'Super Admin',
      passwordHash: hashedPassword, // <--- GIỮ NGUYÊN passwordHash (Không đổi thành password)
      roleId: adminRole.id,
      // storeId null
    },
  });

  console.log(`✅ Admin user created: ${adminUser.email} (Pass: admin123)`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });