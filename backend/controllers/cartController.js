import asyncHandler from 'express-async-handler';
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js'; // Để lấy thông tin sản phẩm

// Helper function to get or create cart
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
  if (!cart) {
    console.log(`Creating new cart for user ${userId}`);
    cart = await Cart.create({ user: userId, items: [] });
    // Populate lại sau khi tạo để đảm bảo có thông tin product đầy đủ
    cart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
  }
  // Tính toán lại tổng giá trị giỏ hàng (nếu cần trả về từ backend)
  // cart.totalPrice = cart.items.reduce((acc, item) => acc + item.qty * item.product.price, 0);
  return cart;
};


// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  res.json(cart);
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const { productId, qty } = req.body;
  const userId = req.user._id;

  const product = await Product.findById(productId);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

   if (product.countInStock < qty) {
     res.status(400);
     throw new Error('Product out of stock or not enough quantity');
   }


  const cart = await getOrCreateCart(userId);

  const existItem = cart.items.find((x) => x.product._id.toString() === productId);

  if (existItem) {
     // Cập nhật số lượng nếu sản phẩm đã tồn tại
     const newQty = existItem.qty + qty;
     if (product.countInStock < newQty) {
          res.status(400);
         throw new Error('Not enough quantity in stock');
     }
    existItem.qty = newQty;
  } else {
    // Thêm sản phẩm mới vào giỏ hàng
    cart.items.push({
      product: productId,
      name: product.name, // Lưu tên tại thời điểm thêm
      image: product.image, // Lưu ảnh
      price: product.price, // Lưu giá
      qty: qty,
    });
  }

  await cart.save();
   // Populate lại để trả về thông tin đầy đủ
  const updatedCart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
  res.status(201).json(updatedCart);
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:productId
// @access  Private
const updateCartItem = asyncHandler(async (req, res) => {
  const { qty } = req.body;
  const productId = req.params.productId;
  const userId = req.user._id;

   const product = await Product.findById(productId);
   if (!product) {
      res.status(404);
      throw new Error('Product not found');
   }

    if (product.countInStock < qty) {
      res.status(400);
      throw new Error('Not enough quantity in stock');
    }

     if (qty <= 0) {
         // Nếu số lượng <= 0, coi như xóa sản phẩm
         return removeFromCart(req, res); // Gọi hàm xóa
     }


  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const item = cart.items.find((x) => x.product.toString() === productId);

  if (item) {
    item.qty = Number(qty);
    await cart.save();
    const updatedCart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
    res.json(updatedCart);
  } else {
    res.status(404);
    throw new Error('Item not found in cart');
  }
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:productId
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const productId = req.params.productId;
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  // Lọc ra những item không phải là item cần xóa
  const originalLength = cart.items.length;
  cart.items = cart.items.filter((x) => x.product.toString() !== productId);

  if (cart.items.length < originalLength) {
      await cart.save();
       const updatedCart = await Cart.findOne({ user: userId }).populate('items.product', 'name price image countInStock');
      res.json(updatedCart);
  } else {
       res.status(404);
      throw new Error('Item not found in cart');
  }

});

export { getCart, addToCart, updateCartItem, removeFromCart };