import express from 'express';
import {
  createOrder,
  getOrder,
  getPendingOrders,
  updateOrderStatus,
  clearCart,
  getUserOrders, // Add this import
} from '../controllers/orderController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Create a new order
router.post('/create', protect, createOrder);

// Get user's orders
router.get('/user', protect, getUserOrders); // Add this route

// Get order details
router.get('/:id', protect, getOrder);

// Get pending orders (admin)
router.get('/pending', protect, admin, getPendingOrders);

// Update order status (admin)
router.put('/:id/status', protect, admin, updateOrderStatus);

// Clear cart after order (user)
router.delete('/cart/clear', protect, clearCart);

export default router;