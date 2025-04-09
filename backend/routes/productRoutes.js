import express from 'express';
import {
  getProducts,
  getProductByIdOrSlug,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview,
  getTopProducts
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // <-- Đảm bảo đã import

const router = express.Router();

router.route('/')
  .get(getProducts) // Lấy danh sách sản phẩm (Public)
  .post(
    protect,
    admin,
    // --- Kích hoạt và cấu hình middleware upload ---
    upload.fields([
        { name: 'image', maxCount: 1 }, // Field 'image' cho ảnh đại diện, tối đa 1 file
        { name: 'images', maxCount: 5 } // Field 'images' cho ảnh phụ, tối đa 5 file (điều chỉnh nếu cần)
    ]),
    // -----------------------------------------------
    createProduct // Gọi controller sau khi upload
   );

router.get('/top', getTopProducts); // Lấy top sản phẩm (Public) - Đặt trước '/:idOrSlug'

router.route('/:idOrSlug')
  .get(getProductByIdOrSlug); // Lấy sản phẩm theo ID hoặc Slug (Public)


// Admin routes for specific product ID
router.route('/:id')
    .put(
        protect,
        admin,
        // --- Kích hoạt và cấu hình upload cho route update ---
        upload.fields([
            { name: 'image', maxCount: 1 },
            { name: 'images', maxCount: 5 }
        ]),
        // -------------------------------------------------------------
        updateProduct // Gọi controller sau khi upload
    )
    .delete(protect, admin, deleteProduct);

// Route để review sản phẩm
router.route('/:id/reviews')
   .post(protect, createProductReview);


export default router;