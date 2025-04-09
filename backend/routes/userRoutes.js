import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
} from '../controllers/userController.js';
import { protect, admin } from '../middleware/authMiddleware.js'; // Import middleware

const router = express.Router();

// Route cho user thường (cần đăng nhập)
router.route('/profile')
  .get(protect, getUserProfile)     // Lấy profile
  .put(protect, updateUserProfile); // Cập nhật profile

// Routes cho Admin (cần đăng nhập và là admin)
router.route('/')
  .get(protect, admin, getUsers);    // Lấy danh sách users

router.route('/:id')
  .get(protect, admin, getUserById)   // Lấy user theo ID
  .put(protect, admin, updateUser)    // Cập nhật user bởi admin
  .delete(protect, admin, deleteUser); // Xóa user bởi admin

export default router;