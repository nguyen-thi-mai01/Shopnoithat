import asyncHandler from 'express-async-handler';
import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import Cart from '../models/cartModel.js';

// @desc    Create a new order
// @route   POST /api/orders/create
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { items, shipping, total } = req.body;

  if (!items || items.length === 0 || !shipping || !total) {
    res.status(400);
    throw new Error('Invalid order data');
  }

  // Validate products and stock
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) {
      res.status(404);
      throw new Error(`Product ${item.name} not found`);
    }
    if (product.countInStock < item.qty) {
      res.status(400);
      throw new Error(`Product ${item.name} is out of stock`);
    }
    // Update stock
    product.countInStock -= item.qty;
    await product.save();
  }

  const order = new Order({
    user: req.user._id,
    items,
    shipping,
    total,
    status: 'pending',
  });

  const createdOrder = await order.save();
  res.status(201).json({ orderId: createdOrder._id });
});

// @desc    Get user's orders
// @route   GET /api/orders/user
// @access  Private
const getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).populate('user', 'name email');
  res.json(orders);
});

// @desc    Get order details
// @route   GET /api/orders/:id
// @access  Private
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  // Ensure the user owns the order or is an admin
  if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }
  res.json(order);
});

// @desc    Get pending orders
// @route   GET /api/orders/pending
// @access  Private/Admin
const getPendingOrders = asyncHandler(async (req, res) => {
  try {
    const orders = await Order.find({ status: 'pending' }).populate('user', 'name email');
    // Handle cases where user data might be missing
    const sanitizedOrders = orders.map(order => ({
      ...order._doc,
      user: order.user || { name: 'Unknown', email: 'N/A' }, // Fallback if user is null
    }));
    res.json(sanitizedOrders);
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    throw new Error('Failed to fetch pending orders');
  }
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'preparing', 'shipping', 'delivered'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid status');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.status = status;
  const updatedOrder = await order.save();
  res.json(updatedOrder);
});

// @desc    Clear user's cart
// @route   DELETE /api/orders/cart/clear
// @access  Private
const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.items = [];
  await cart.save();
  res.json({ message: 'Cart cleared' });
});

export { createOrder, getOrder, getPendingOrders, updateOrderStatus, clearCart, getUserOrders };