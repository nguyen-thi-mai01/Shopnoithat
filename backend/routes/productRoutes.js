// backend/routes/productRoutes.js
import express from 'express';
import {
    getProducts,
    getProductByIdOrSlug,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductReview,
    getTopProducts,
    getProductSuggestions,
    searchProducts // <<<=== IMPORT HÀM SEARCH MỚI
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // Middleware upload của bạn
import Product from '../models/productModel.js'; // Chỉ dùng cho middleware check flash sale

const router = express.Router();

// Middleware to check and disable expired Flash Sales
const checkFlashSaleStatus = async (req, res, next) => {
    try {
        const now = new Date();
        await Product.updateMany(
            { isFlashSale: true, saleEndDate: { $lt: now } },
            {
                $set: {
                    isFlashSale: false, discountPercentage: 0, saleStartDate: null, saleEndDate: null,
                    totalFlashSaleSlots: 0, remainingFlashSaleSlots: 0, // Reset slots
                },
            }
        );
        next();
    } catch (error) {
        console.error('Middleware Error checking Flash Sale status:', error);
        next(); // Log lỗi và tiếp tục
    }
};

// --- Public GET Routes ---
// Đặt các route không có tham số động lên trước

router.get('/suggestions', getProductSuggestions); // Lấy gợi ý sản phẩm

router.get('/search', searchProducts); // <<<=== ROUTE TÌM KIẾM SẢN PHẨM TỪ HEADER

router.get('/top', checkFlashSaleStatus, getTopProducts); // Lấy top sản phẩm

// Route lấy danh sách sản phẩm (có thể có filter/pagination)
// Áp dụng middleware check flash sale cho route này
router.route('/')
    .get(checkFlashSaleStatus, getProducts);

// Route lấy chi tiết sản phẩm bằng ID hoặc Slug (đặt sau các route cụ thể)
// Áp dụng middleware check flash sale cho route này
router.route('/:idOrSlug')
    .get(checkFlashSaleStatus, getProductByIdOrSlug);


// --- Admin Routes (Protected & Admin Role Required) ---

// Tạo sản phẩm mới (Admin) - POST đến /api/products
router.route('/') // Trùng path với GET nhưng khác method
    .post(
        protect,
        admin,
        // Middleware Multer để xử lý upload file ảnh
        upload.fields([
            { name: 'image', maxCount: 1 },   // Ảnh chính
            { name: 'images', maxCount: 5 }  // Ảnh phụ (tối đa 5)
        ]),
        createProduct
    );

// Cập nhật và Xóa sản phẩm bằng ID (Admin) - PUT & DELETE đến /api/products/:id
router.route('/:id')
    .put(
        protect,
        admin,
        // Middleware Multer cũng cần ở đây để xử lý cập nhật ảnh
        upload.fields([
            { name: 'image', maxCount: 1 },
            { name: 'images', maxCount: 5 }
        ]),
        updateProduct
    )
    .delete(protect, admin, deleteProduct);


// --- User Routes (Protected) ---

// Tạo đánh giá sản phẩm (User đã đăng nhập) - POST đến /api/products/:id/reviews
router.route('/:id/reviews')
    .post(protect, createProductReview);


export default router;