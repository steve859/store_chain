import prisma from '../../db/prisma';

export const CategoriesRepository = {
  findProductCategories: async () => {
    return prisma.products.findMany({
      select: { category: true },
    });
  },
};
