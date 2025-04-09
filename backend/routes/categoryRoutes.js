// backend/routes/categoryRoutes.js
import express from 'express';
import {
  createCategory,
  getCategories,
  getCategoryByIdOrSlug,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // <-- Import upload middleware

const router = express.Router();

router.route('/')
  .post(
    protect,
    admin,
    upload.single('categoryImage'), // <-- Áp dụng middleware upload cho việc tạo mới
    createCategory
  )
  .get(getCategories); // Lấy danh sách categories (Public)

router.route('/:idOrSlug')
   .get(getCategoryByIdOrSlug); // Lấy category theo ID hoặc Slug (Public)

// Admin routes for specific category ID
router.route('/:id')
  .put(
    protect,
    admin,
    upload.single('categoryImage'), // <-- Áp dụng middleware upload cho việc cập nhật
    updateCategory
   )
  .delete(protect, admin, deleteCategory);

export default router;