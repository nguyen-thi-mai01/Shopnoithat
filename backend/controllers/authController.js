import asyncHandler from 'express-async-handler';
import User from '../models/userModel.js';
import generateToken from '../utils/generateToken.js'; // Sẽ tạo file này sau

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Kiểm tra user đã tồn tại chưa
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400); // Bad request
    throw new Error('User already exists');
  }

  // Tạo user mới (mật khẩu sẽ được hash bởi middleware trong userModel)
  const user = await User.create({
    name,
    email,
    password,
    // isAdmin sẽ là default false
  });

  if (user) {
    res.status(201).json({ // Created
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id), // Tạo JWT token
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Tìm user bằng email
  const user = await User.findOne({ email });

  // Kiểm tra user và mật khẩu
  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    });
  } else {
    res.status(401); // Unauthorized
    throw new Error('Invalid email or password');
  }
});

 // @desc    Register a new admin user (Có thể tạo endpoint riêng hoặc dùng tool/script)
 // @route   POST /api/auth/register-admin (Ví dụ)
 // @access  Private/Admin (Cần cơ chế bảo vệ khác, ví dụ check secret key)
 const registerAdmin = asyncHandler(async (req, res) => {
     // Tương tự registerUser nhưng set isAdmin = true
     const { name, email, password /*, adminSecretKey */ } = req.body;

     // ---> Thêm kiểm tra adminSecretKey ở đây nếu cần <---

     const userExists = await User.findOne({ email });
     if (userExists) {
         res.status(400);
         throw new Error('User already exists');
     }

     const user = await User.create({
         name,
         email,
         password,
         isAdmin: true, // Set là admin
     });

     if (user) {
         res.status(201).json({
             _id: user._id,
             name: user.name,
             email: user.email,
             isAdmin: user.isAdmin,
             token: generateToken(user._id),
         });
     } else {
         res.status(400);
         throw new Error('Invalid user data');
     }
 });


export { registerUser, loginUser, registerAdmin };