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
    getProductSuggestions // <--- Import the new controller function
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js'; // Assuming this handles file uploads correctly
import Product from '../models/productModel.js'; // Used only for the middleware below

const router = express.Router();

// Middleware to check and disable expired Flash Sales (can be applied selectively)
// Consider if this check is needed on every product route or can be run periodically
const checkFlashSaleStatus = async (req, res, next) => {
    try {
        // Logic to disable expired flash sales
        await Product.updateMany(
            {
                isFlashSale: true,
                saleEndDate: { $lt: new Date() },
            },
            {
                $set: {
                    isFlashSale: false,
                    discountPercentage: 0,
                    saleStartDate: null,
                    saleEndDate: null,
                    // Optionally reset slots too, depending on logic
                    // totalFlashSaleSlots: 0,
                    // remainingFlashSaleSlots: 0,
                },
            }
        );
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Middleware Error checking Flash Sale status:', error);
        // Decide if you want to block the request or just log the error
        // For robustness, maybe just log and continue
        next();
        // Or send an error response:
        // res.status(500).json({ message: 'Server error checking Flash Sale status', error: error.message });
    }
};

// --- NEW ROUTE FOR SUGGESTIONS ---
// Needs to be defined *before* routes with parameters like /:idOrSlug
router.get('/suggestions', getProductSuggestions); // Public route for suggestions
// --- END NEW ROUTE ---

// Routes for getting products (Public)
router.route('/')
    .get(checkFlashSaleStatus, getProducts); // Get list of products (apply flash sale check)

router.get('/top', checkFlashSaleStatus, getTopProducts); // Get top products (apply flash sale check)

// Route for getting a single product by ID or Slug (Public)
// This needs to be defined *after* specific routes like /suggestions and /top
router.route('/:idOrSlug')
    .get(checkFlashSaleStatus, getProductByIdOrSlug); // Get single product (apply flash sale check)


// --- Admin Routes ---

// Create a new product (Admin only)
router.route('/')
    .post(
        protect, // Must be logged in
        admin,   // Must be an admin
        // Multer middleware for handling 'image' and 'images' fields
        upload.fields([
            { name: 'image', maxCount: 1 },  // Single main image
            { name: 'images', maxCount: 5 } // Up to 5 additional images
        ]),
        createProduct // Controller function
    );

// Update and Delete specific product by ID (Admin only)
router.route('/:id')
    .put(
        protect,
        admin,
        upload.fields([ // Handle potential image updates
            { name: 'image', maxCount: 1 },
            { name: 'images', maxCount: 5 }
        ]),
        updateProduct
    )
    .delete(protect, admin, deleteProduct); // Delete product


// --- User Routes ---

// Create a product review (Logged in users only)
router.route('/:id/reviews')
    .post(protect, createProductReview); // Only needs user to be logged in


export default router;