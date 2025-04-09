import express from 'express';
import { registerUser, loginUser, registerAdmin } from '../controllers/authController.js';
// Thêm middleware bảo vệ cho registerAdmin nếu cần
// import { protect, admin } from '../middleware/authMiddleware.js';


const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
 // router.post('/register-admin', protect, admin, registerAdmin); // Ví dụ bảo vệ route tạo admin

export default router;