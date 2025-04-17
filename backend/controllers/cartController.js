import asyncHandler from 'express-async-handler';
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js';
import { getClientImagePath } from '../controllers/productController.js'; // Import the function

// Helper function to get or create cart
const getOrCreateCart = async (userId) => {
  try {
    let cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');

    if (!cart) {
      console.log(`Creating new cart for user ${userId}`);
      cart = await Cart.create({ user: userId, items: [] });
      // Populate again after creating to ensure we have product data
      cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
    }

    // Filter out items where the product no longer exists (i.e., populate returned null)
    const originalLength = cart.items.length;
    cart.items = cart.items.filter(item => item.product !== null);
    if (cart.items.length !== originalLength) {
      await cart.save(); // Save the cart after filtering
      cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
    }

    return cart;
  } catch (error) {
    console.error("Error in getOrCreateCart:", error);
    throw error; // Re-throw to be caught by the calling function
  }
};

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    res.json(cart);
  } catch (error) {
    console.error("GetCart error:", error);
    res.status(500);
    throw new Error('Failed to retrieve cart');
  }
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const { productId, qty } = req.body;

  // Validate input
  if (!productId) {
    res.status(400);
    throw new Error('Product ID is required');
  }

  const quantity = parseInt(qty);
  if (isNaN(quantity) || quantity <= 0) {
    res.status(400);
    throw new Error('Quantity must be a positive number');
  }

  const userId = req.user._id;

  try {
    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    // Validate product data to match schema requirements
    if (!product.name) {
      res.status(400);
      throw new Error('Product name is missing');
    }

    // Use placeholder for image if not available
    const productImage = product.image || '/images/placeholder.png';

    if (typeof product.price !== 'number') {
      res.status(400);
      throw new Error('Invalid product price');
    }

    // Check stock availability
    if (product.countInStock < quantity) {
      res.status(400);
      throw new Error(`Only ${product.countInStock} items available in stock`);
    }

    // Get or create cart
    const cart = await getOrCreateCart(userId);

    // Find if product already exists in cart
    const existItemIndex = cart.items.findIndex(
      (x) => x.product && x.product._id && x.product._id.toString() === productId
    );

    if (existItemIndex !== -1) {
      // Update quantity if product exists
      const existItem = cart.items[existItemIndex];
      const newQty = existItem.qty + quantity;

      if (product.countInStock < newQty) {
        res.status(400);
        throw new Error(`Can't add ${quantity} more. Only ${product.countInStock} items available in stock.`);
      }

      // Update existing item
      cart.items[existItemIndex].qty = newQty;
      // Update price in case it has changed
      cart.items[existItemIndex].price = product.price;
    } else {
      // Add new product to cart
      cart.items.push({
        product: productId,
        name: product.name,
        image: getClientImagePath(productImage), // Use the function here
        price: product.price,
        qty: quantity
      });
    }

    // Save cart
    await cart.save();

    // Populate and return updated cart
    const updatedCart = await Cart.findOne({ user: userId }).populate(
      'items.product',
      'name price image countInStock'
    );

    res.status(201).json(updatedCart);
  } catch (error) {
    console.error('Add to cart error:', error);
    // If it's already an HTTP error with status, just rethrow
    if (res.statusCode !== 200) {
      throw error;
    }
    // Otherwise set 500 and throw
    res.status(500);
    throw new Error(error.message || 'Error adding item to cart');
  }
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:productId
// @access  Private
const updateCartItem = asyncHandler(async (req, res) => {
  const { qty } = req.body;
  const productId = req.params.productId;
  const userId = req.user._id;

  // Validate input
  const quantity = parseInt(qty);
  if (isNaN(quantity)) {
    res.status(400);
    throw new Error('Quantity must be a number');
  }

  try {
    // Find product for stock validation
    const product = await Product.findById(productId);
    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    // Remove item if quantity is 0 or negative
    if (quantity <= 0) {
      return removeFromCart(req, res);
    }

    // Check stock
    if (product.countInStock < quantity) {
      res.status(400);
      throw new Error(`Not enough quantity in stock. Maximum available: ${product.countInStock}`);
    }

    // Find the cart
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    // Find the item
    const itemIndex = cart.items.findIndex(
      (x) => x.product.toString() === productId
    );

    if (itemIndex === -1) {
      res.status(404);
      throw new Error('Item not found in cart');
    }

    // Update the quantity
    cart.items[itemIndex].qty = quantity;
    // Also update the price in case it changed
    cart.items[itemIndex].price = product.price;

    // Save the cart
    await cart.save();

    // Return updated cart with populated product info
    const updatedCart = await Cart.findOne({ user: userId }).populate(
      'items.product',
      'name price image countInStock'
    );

    res.json(updatedCart);
  } catch (error) {
    console.error('Update cart error:', error);
    // If it's already an HTTP error with status, just rethrow
    if (res.statusCode !== 200) {
      throw error;
    }
    // Otherwise set 500 and throw
    res.status(500);
    throw new Error(error.message || 'Error updating cart item');
  }
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const productId = req.params.productId;
  const userId = req.user._id;

  try {
    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    // Save original length to check if item was found
    const originalLength = cart.items.length;

    // Filter out the item to remove
    cart.items = cart.items.filter((x) => x.product.toString() !== productId);

    // Check if item was found and removed
    if (cart.items.length === originalLength) {
      res.status(404);
      throw new Error('Item not found in cart');
    }

    // Save the updated cart
    await cart.save();

    // Return the updated cart with populated product info
    const updatedCart = await Cart.findOne({ user: userId }).populate(
      'items.product',
      'name price image countInStock'
    );

    res.json(updatedCart);
  } catch (error) {
    console.error('Remove from cart error:', error);
    // If it's already an HTTP error with status, just rethrow
    if (res.statusCode !== 200) {
      throw error;
    }
    // Otherwise set 500 and throw
    res.status(500);
    throw new Error(error.message || 'Error removing item from cart');
  }
});

export { getCart, addToCart, updateCartItem, removeFromCart };