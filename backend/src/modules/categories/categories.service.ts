import { CategoriesRepository } from './categories.repository';

interface CreateCategoryDto {
  name: string;
  description?: string;
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
}

export const createCategory = async (data: CreateCategoryDto, adminId: string) => {
  void data;
  void adminId;
  throw new Error('Not supported: categories are derived from products.category');
};

export const getAllCategories = async () => {
  const products = await CategoriesRepository.findProductCategories();

  const counts: Record<string, number> = {};
  for (const p of products) {
    const c = (p.category ?? '').trim();
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([name, productsCount]) => ({
      id: name,
      name,
      description: null,
      productsCount,
    }));
};

export const getCategoryById = async (id: string) => {
  const categories = await getAllCategories();
  const found = categories.find((c) => c.id === id);
  if (!found) throw new Error('Category not found');
  return found;
};

export const updateCategory = async (id: string, data: UpdateCategoryDto, adminId: string) => {
  void id;
  void data;
  void adminId;
  throw new Error('Not supported: categories are derived from products.category');
};

export const deleteCategory = async (id: string, adminId: string) => {
  void id;
  void adminId;
  throw new Error('Not supported: categories are derived from products.category');
};
