import asyncHandler from 'express-async-handler';
import User from '../models/userModel.js';

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  // req.user được lấy từ middleware 'protect'
  const user = await User.findById(req.user._id).select('-password'); // Lấy user hiện tại

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    // Chỉ cập nhật mật khẩu nếu người dùng nhập mật khẩu mới
    if (req.body.password) {
      user.password = req.body.password; // Mongoose pre-save hook sẽ hash
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      // Không trả lại token ở đây trừ khi email/thông tin quan trọng thay đổi và cần re-issue
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// --- Admin Functions ---

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password'); // Lấy tất cả user, bỏ password
  res.json(users);
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
     if (user.isAdmin) {
         res.status(400);
         throw new Error('Cannot delete admin user');
     }
    await user.deleteOne(); // Hoặc user.remove() ở Mongoose cũ
    res.json({ message: 'User removed successfully' });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user (by Admin)
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    // Admin có thể thay đổi quyền admin (cẩn thận khi sử dụng)
    // Nên có kiểm tra không cho phép admin tự bỏ quyền của mình
    if (req.body.isAdmin !== undefined) {
         // Thêm logic kiểm tra an toàn ở đây nếu cần
          user.isAdmin = req.body.isAdmin;
    }
    // Admin không nên thay đổi mật khẩu trực tiếp ở đây, cần cơ chế reset riêng

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

export {
  getUserProfile,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
};