import express from 'express';
import { uploadFile } from '../controllers/uploadController.js';
import upload from '../middleware/uploadMiddleware.js'; // Middleware Multer
import { protect, admin } from '../middleware/authMiddleware.js'; // Bảo vệ nếu cần

const router = express.Router();

// Route cho upload 1 ảnh (ví dụ: ảnh đại diện sản phẩm, category)
// 'image' là tên field trong FormData gửi từ frontend
router.post('/single', protect, admin, upload.single('image'), uploadFile);

// Route cho upload nhiều ảnh (ví dụ: gallery ảnh sản phẩm)
// 'images' là tên field, 5 là số lượng file tối đa
router.post('/multiple', protect, admin, upload.array('images', 5), uploadFile);

 // Route cho upload logo (nếu cần)
 router.post('/logo', protect, admin, upload.single('logoImage'), uploadFile);

export default router;