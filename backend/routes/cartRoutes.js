import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
} from '../controllers/cartController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getCart)     // Lấy giỏ hàng
  .post(protect, addToCart);  // Thêm vào giỏ hàng

router.route('/:productId') // Dùng productId làm param
  .put(protect, updateCartItem)     // Cập nhật số lượng
  .delete(protect, removeFromCart); // Xóa khỏi giỏ hàng

export default router;