// backend/controllers/productController.js
import asyncHandler from 'express-async-handler';
import Product from '../models/productModel.js';
import Category from '../models/categoryModel.js';
import fs from 'fs';
import path from 'path';

// Helper function to create a client-accessible path from the server's original path
const getClientImagePath = (serverPath) => {
  if (!serverPath) return null;
  // Replace backslashes with forward slashes and remove 'backend/' prefix
  const normalizedPath = serverPath.replace(/\\/g, '/');
  const clientPath = normalizedPath.replace(/^backend\//, '');
  // Ensure it starts with a slash
  return clientPath.startsWith('/') ? clientPath : '/' + clientPath;
};

// Helper function to get the full server path from the stored original path
const getServerFullPath = (originalPath) => {
  if (!originalPath) return null;
  const __dirname = path.resolve(); // Get current directory
  return path.join(__dirname, originalPath); // Join with the relative path from model
};


// Helper function to disable expired Flash Sales
const disableExpiredFlashSales = async () => {
  try {
    const now = new Date();
    await Product.updateMany(
      {
        isFlashSale: true,
        saleEndDate: { $lt: now }, // Find sales that ended before now
      },
      {
        $set: { // Reset flash sale fields
          isFlashSale: false,
          discountPercentage: 0,
          saleStartDate: null,
          saleEndDate: null,
          totalFlashSaleSlots: 0,
          remainingFlashSaleSlots: 0,
        },
      }
    );
  } catch (error) {
    console.error('Error disabling expired Flash Sales:', error);
    // Don't throw error here, just log it, as it's a background task
  }
};

// --- HÀM MỚI ĐỂ LẤY GỢI Ý TÌM KIẾM ---
// @desc    Fetch product suggestions based on keyword
// @route   GET /api/products/suggestions
// @access  Public
const getProductSuggestions = asyncHandler(async (req, res) => {
  const keyword = req.query.keyword ? req.query.keyword.trim() : '';
  const limit = parseInt(req.query.limit) || 5; // Default limit 5 suggestions

  if (!keyword) {
    return res.json([]); // Return empty array if no keyword
  }

  try {
    // Find products where name contains the keyword (case-insensitive)
    const suggestions = await Product.find({
      name: {
        $regex: keyword,
        $options: 'i', // 'i' for case-insensitive
      },
    })
      .limit(limit) // Apply the limit
      .select('_id name slug image price'); // Select only needed fields

    // Format the results to include client-friendly image paths
    const formattedSuggestions = suggestions.map((product) => ({
      _id: product._id,
      name: product.name,
      slug: product.slug,
      image: getClientImagePath(product.image), // Convert image path
      price: product.price,
    }));

    res.json(formattedSuggestions);
  } catch (error) {
    console.error('Error fetching product suggestions:', error);
    res.status(500).json({ message: 'Lỗi khi lấy gợi ý sản phẩm' });
  }
});
// --- KẾT THÚC HÀM MỚI ---

// @desc    Fetch all products (with filter, sort, pagination)
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
    await disableExpiredFlashSales(); // Check expired sales before fetching

    const pageSize = 12; // Products per page
    const page = Number(req.query.pageNumber) || 1; // Current page number

    // Keyword filter for product name
    const keyword = req.query.keyword
        ? {
              name: {
                  $regex: req.query.keyword,
                  $options: 'i', // Case-insensitive
              },
          }
        : {};

    // Category filter using slug
    const categorySlug = req.query.category;
    let categoryFilter = {};
    if (categorySlug) {
        const category = await Category.findOne({ slug: categorySlug });
        if (category) {
            categoryFilter = { category: category._id };
        } else {
            // If category slug is provided but not found, return no products
            res.json({ products: [], page: 1, pages: 0, count: 0 });
            return;
        }
    }

    // Price range filter
    const minPrice = req.query['price[gte]'] ? Number(req.query['price[gte]']) : 0;
    const maxPrice = req.query['price[lte]'] ? Number(req.query['price[lte]']) : Infinity;
    const priceFilter = { price: { $gte: minPrice, $lte: maxPrice } };

    // Flash Sale filter
    const flashSaleFilter = req.query.isFlashSale === 'true'
        ? {
            isFlashSale: true,
            saleStartDate: { $lte: new Date() }, // Sale must have started
            saleEndDate: { $gte: new Date() },   // Sale must not have ended
            remainingFlashSaleSlots: { $gt: 0 }, // Must have slots left
        }
        : {};

    // Status filter (In Stock, Out of Stock, New Arrival)
    let statusFilter = {};
    if (req.query.status) {
        if (req.query.status === 'In Stock') {
            statusFilter = { countInStock: { $gt: 0 } };
        } else if (req.query.status === 'Out of Stock') {
            statusFilter = { countInStock: 0 };
        } else if (req.query.status === 'New Arrival') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            statusFilter = { createdAt: { $gte: oneMonthAgo } }; // Created within the last month
        }
    }

    // Combine all filters
    const filters = { ...keyword, ...categoryFilter, ...priceFilter, ...flashSaleFilter, ...statusFilter };

    // Sorting options
    let sortOptions = {};
    const sortBy = req.query.sortBy;
    if (sortBy === 'price-asc') sortOptions = { price: 1 };
    else if (sortBy === 'price-desc') sortOptions = { price: -1 };
    else if (sortBy === 'latest') sortOptions = { createdAt: -1 };
    else if (sortBy === 'rating') sortOptions = { rating: -1 };
    else sortOptions = { createdAt: -1 }; // Default sort by latest

    // Get total count for pagination
    const count = await Product.countDocuments(filters);

    // Fetch products with filters, sorting, and pagination
    const productsFromDB = await Product.find(filters)
        .populate('category', 'id name slug') // Populate category details
        .sort(sortOptions)
        .limit(pageSize)
        .skip(pageSize * (page - 1));

    // Format products for the client
    const products = productsFromDB.map((product) => {
        const productObj = product.toObject(); // Convert Mongoose document to plain object
        // Check if the product is currently in an active Flash Sale
        const isActiveFlashSale =
            product.isFlashSale &&
            product.saleStartDate <= new Date() &&
            product.saleEndDate >= new Date();
        // Calculate discounted price if it's an active flash sale
        const discountedPrice = isActiveFlashSale
            ? product.price * (1 - product.discountPercentage / 100)
            : product.price;

        return {
            ...productObj,
            image: getClientImagePath(product.image), // Main image path for client
            images: product.images // Additional images path for client
                ? product.images.map((imgPath) => getClientImagePath(imgPath)).filter((p) => p) // Filter out null paths
                : [],
            discount: product.discountPercentage, // Include discount percentage
            discountedPrice: isActiveFlashSale ? discountedPrice : null, // Include discounted price only if active
            isActiveFlashSale, // Include flag indicating if flash sale is active
        };
    });

    // Send response with products and pagination info
    res.json({ products, page, pages: Math.ceil(count / pageSize), count });
});

// @desc    Fetch single product by ID or Slug
// @route   GET /api/products/:idOrSlug
// @access  Public
const getProductByIdOrSlug = asyncHandler(async (req, res) => {
    try {
        await disableExpiredFlashSales(); // Check expired sales

        const idOrSlug = req.params.idOrSlug;
        let productFromDB;

        // Check if the parameter looks like a MongoDB ObjectId
        if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
            // Fetch by ID and populate category and reviews
            productFromDB = await Product.findById(idOrSlug)
                .populate('category', 'id name slug')
                .populate('reviews.user', 'id name'); // Populate user info in reviews
        } else {
            // Fetch by slug and populate category and reviews
            productFromDB = await Product.findOne({ slug: idOrSlug })
                .populate('category', 'id name slug')
                .populate('reviews.user', 'id name');
        }

        // If product not found
        if (!productFromDB) {
            res.status(404);
            throw new Error('Sản phẩm không tồn tại');
        }

        // Validate if category was populated correctly (handle potential data inconsistency)
        if (!productFromDB.category) {
            console.error(`Category not found for product with ID/slug: ${idOrSlug}`);
            // Maybe return a 500 or handle differently, depending on requirements
            res.status(400); // Or 500
            throw new Error('Danh mục của sản phẩm không tồn tại hoặc đã bị xóa.');
        }

        // Fetch related products (same category, different product, limit 4)
        const relatedFromDB = await Product.find({
            category: productFromDB.category._id, // Must be in the same category
            _id: { $ne: productFromDB._id },      // Must not be the same product
        })
            .limit(4)
            .select('name slug price image rating numReviews isFlashSale saleStartDate saleEndDate discountPercentage'); // Select needed fields for related products

        // Format the main product for the client
        const productObj = productFromDB.toObject();
        const isActiveFlashSale =
            productFromDB.isFlashSale &&
            productFromDB.saleStartDate <= new Date() &&
            productFromDB.saleEndDate >= new Date();
        const discountedPrice = isActiveFlashSale
            ? productFromDB.price * (1 - productFromDB.discountPercentage / 100)
            : productFromDB.price;

        const product = {
            ...productObj,
            image: getClientImagePath(productFromDB.image),
            images: productFromDB.images
                ? productFromDB.images.map((imgPath) => getClientImagePath(imgPath)).filter((p) => p)
                : [],
            discount: productFromDB.discountPercentage,
            discountedPrice: isActiveFlashSale ? discountedPrice : null,
            isActiveFlashSale,
        };

        // Format the related products for the client
        const relatedProducts = relatedFromDB.map((relProd) => {
            const relProdObj = relProd.toObject();
            const relIsActiveFlashSale =
                relProd.isFlashSale &&
                relProd.saleStartDate <= new Date() &&
                relProd.saleEndDate >= new Date();
            const relDiscountedPrice = relIsActiveFlashSale
                ? relProd.price * (1 - relProd.discountPercentage / 100)
                : relProd.price;

            return {
                ...relProdObj,
                image: getClientImagePath(relProd.image),
                discount: relProd.discountPercentage,
                discountedPrice: relIsActiveFlashSale ? relDiscountedPrice : null,
                isActiveFlashSale: relIsActiveFlashSale,
            };
        });

        // Send the main product along with related products
        res.json({ ...product, relatedProducts });

    } catch (error) {
        // Log the specific error for debugging
        console.error(`Error in getProductByIdOrSlug for ${req.params.idOrSlug}:`, error);
        // Re-throw the error to be caught by the global error handler
        throw error;
    }
});


// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
    // Destructure required fields from request body
    const {
        name,
        price,
        description,
        category, // Category ID expected
        quantity, // Renamed from countInStock in input, mapped later
        isFlashSale,
        discountPercentage,
        saleStartDate,
        saleEndDate,
        totalFlashSaleSlots,
        remainingFlashSaleSlots,
    } = req.body;

    // Get original image paths from uploaded files (using multer field names)
    let originalImagePath = null;
    if (req.files && req.files['image'] && req.files['image'].length > 0) {
        originalImagePath = req.files['image'][0].path; // Get path from multer
    }

    let originalAdditionalImagePaths = [];
    if (req.files && req.files['images'] && req.files['images'].length > 0) {
        originalAdditionalImagePaths = req.files['images'].map((file) => file.path);
    }

    // --- Validation ---
    if (!originalImagePath) {
        res.status(400);
        throw new Error('Ảnh đại diện (Trường: image) là bắt buộc.');
    }
    if (!name || !price || !description || !category || quantity === undefined || quantity === null) {
        res.status(400);
        throw new Error('Vui lòng điền đầy đủ các trường bắt buộc: Tên, Giá, Mô tả, Danh mục, Số lượng.');
    }
    if (isNaN(Number(price)) || Number(price) < 0 || isNaN(Number(quantity)) || Number(quantity) < 0) {
        res.status(400);
        throw new Error('Giá và Số lượng phải là số không âm.');
    }

    // Flash Sale specific validation
    if (isFlashSale === 'true' || isFlashSale === true) { // Check both string 'true' and boolean true
        if (discountPercentage === undefined || discountPercentage === null || isNaN(Number(discountPercentage)) || Number(discountPercentage) < 0 || Number(discountPercentage) > 100) {
            res.status(400);
            throw new Error('Phần trăm giảm giá Flash Sale phải là số từ 0 đến 100.');
        }
        if (!saleStartDate || !saleEndDate) {
            res.status(400);
            throw new Error('Ngày bắt đầu và kết thúc Flash Sale là bắt buộc.');
        }
        const startDate = new Date(saleStartDate);
        const endDate = new Date(saleEndDate);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
            res.status(400);
            throw new Error('Ngày bắt đầu và kết thúc Flash Sale không hợp lệ hoặc ngày kết thúc phải sau ngày bắt đầu.');
        }
        if (totalFlashSaleSlots === undefined || totalFlashSaleSlots === null || isNaN(Number(totalFlashSaleSlots)) || Number(totalFlashSaleSlots) < 0 ||
            remainingFlashSaleSlots === undefined || remainingFlashSaleSlots === null || isNaN(Number(remainingFlashSaleSlots)) || Number(remainingFlashSaleSlots) < 0 ||
            Number(totalFlashSaleSlots) < Number(remainingFlashSaleSlots)) {
            res.status(400);
            throw new Error('Số suất Flash Sale không hợp lệ (Tổng số suất và số suất còn lại phải là số không âm, và Tổng >= Còn lại).');
        }
    }
    // --- End Validation ---

    // Create new Product instance
    const product = new Product({
        name,
        price: Number(price),
        user: req.user._id, // Associate with the logged-in admin user
        image: originalImagePath, // Store the original path provided by multer
        images: originalAdditionalImagePaths,
        category, // Store the category ID
        countInStock: Number(quantity), // Map 'quantity' from input to 'countInStock'
        numReviews: 0, // Initialize reviews
        rating: 0,     // Initialize rating
        description,
        // Set Flash Sale fields conditionally
        isFlashSale: isFlashSale === 'true' || isFlashSale === true,
        discountPercentage: (isFlashSale === 'true' || isFlashSale === true) ? Number(discountPercentage) : 0,
        saleStartDate: (isFlashSale === 'true' || isFlashSale === true) ? new Date(saleStartDate) : null,
        saleEndDate: (isFlashSale === 'true' || isFlashSale === true) ? new Date(saleEndDate) : null,
        totalFlashSaleSlots: (isFlashSale === 'true' || isFlashSale === true) ? Number(totalFlashSaleSlots) : 0,
        remainingFlashSaleSlots: (isFlashSale === 'true' || isFlashSale === true) ? Number(remainingFlashSaleSlots) : 0,
        // slug will be generated automatically by the pre-save hook in the model
    });

    // Save the product to the database
    const createdProduct = await product.save();

    // Format the created product for the response
    const responseProduct = {
        ...createdProduct.toObject(),
        image: getClientImagePath(createdProduct.image),
        images: createdProduct.images
            ? createdProduct.images.map((p) => getClientImagePath(p)).filter((p) => p)
            : [],
        // Recalculate flash sale status for the response just in case creation took time
        isActiveFlashSale:
            createdProduct.isFlashSale &&
            createdProduct.saleStartDate <= new Date() &&
            createdProduct.saleEndDate >= new Date(),
        discountedPrice:
            (createdProduct.isFlashSale &&
             createdProduct.saleStartDate <= new Date() &&
             createdProduct.saleEndDate >= new Date())
            ? createdProduct.price * (1 - createdProduct.discountPercentage / 100)
            : null, // Only show discountedPrice if active
        discount: createdProduct.discountPercentage, // Keep discount percentage regardless
    };

    res.status(201).json(responseProduct); // Send 201 Created status and the product data
});


// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
    // Destructure fields from request body
    const {
        name,
        price,
        description,
        category,
        quantity,
        isFlashSale,
        discountPercentage,
        saleStartDate,
        saleEndDate,
        totalFlashSaleSlots,
        remainingFlashSaleSlots,
    } = req.body;

    // Find the existing product by ID
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }

    // Store old image paths for potential deletion later
    const oldOriginalImagePath = product.image;
    const oldOriginalAdditionalImagePaths = product.images || []; // Ensure it's an array

    // Check for new uploaded files
    let newOriginalImagePath = null;
    if (req.files && req.files['image'] && req.files['image'].length > 0) {
        newOriginalImagePath = req.files['image'][0].path;
    }

    let newOriginalAdditionalImagePaths = [];
    if (req.files && req.files['images'] && req.files['images'].length > 0) {
        newOriginalAdditionalImagePaths = req.files['images'].map((file) => file.path);
    }

    // --- Validation ---
    // (Similar validation as createProduct, but check if values are provided before validating)
    if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
        res.status(400); throw new Error('Giá phải là số không âm.');
    }
    if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) < 0)) {
         res.status(400); throw new Error('Số lượng phải là số không âm.');
    }

    const updateIsFlashSale = isFlashSale !== undefined ? (isFlashSale === 'true' || isFlashSale === true) : product.isFlashSale;

    if (updateIsFlashSale) {
        const finalDiscountPercentage = discountPercentage !== undefined ? Number(discountPercentage) : product.discountPercentage;
        const finalSaleStartDate = saleStartDate !== undefined ? new Date(saleStartDate) : product.saleStartDate;
        const finalSaleEndDate = saleEndDate !== undefined ? new Date(saleEndDate) : product.saleEndDate;
        const finalTotalSlots = totalFlashSaleSlots !== undefined ? Number(totalFlashSaleSlots) : product.totalFlashSaleSlots;
        const finalRemainingSlots = remainingFlashSaleSlots !== undefined ? Number(remainingFlashSaleSlots) : product.remainingFlashSaleSlots;

        if (isNaN(finalDiscountPercentage) || finalDiscountPercentage < 0 || finalDiscountPercentage > 100) {
            res.status(400); throw new Error('Phần trăm giảm giá Flash Sale phải là số từ 0 đến 100.');
        }
        if (!finalSaleStartDate || !finalSaleEndDate || isNaN(finalSaleStartDate.getTime()) || isNaN(finalSaleEndDate.getTime())) {
            res.status(400); throw new Error('Ngày bắt đầu và kết thúc Flash Sale là bắt buộc và phải hợp lệ.');
        }
        if (finalSaleStartDate >= finalSaleEndDate) {
            res.status(400); throw new Error('Ngày kết thúc Flash Sale phải sau ngày bắt đầu.');
        }
        if (isNaN(finalTotalSlots) || finalTotalSlots < 0 || isNaN(finalRemainingSlots) || finalRemainingSlots < 0 || finalTotalSlots < finalRemainingSlots) {
            res.status(400); throw new Error('Số suất Flash Sale không hợp lệ (Tổng >= Còn lại, >= 0).');
        }
         // Assign validated values
        product.discountPercentage = finalDiscountPercentage;
        product.saleStartDate = finalSaleStartDate;
        product.saleEndDate = finalSaleEndDate;
        product.totalFlashSaleSlots = finalTotalSlots;
        product.remainingFlashSaleSlots = finalRemainingSlots;
    } else {
        // If turning off Flash Sale, reset fields
        product.discountPercentage = 0;
        product.saleStartDate = null;
        product.saleEndDate = null;
        product.totalFlashSaleSlots = 0;
        product.remainingFlashSaleSlots = 0;
    }
     product.isFlashSale = updateIsFlashSale;
    // --- End Validation ---

    // Update product fields if they are provided in the request body
    product.name = name || product.name;
    product.price = price !== undefined ? Number(price) : product.price;
    product.description = description || product.description;
    product.category = category || product.category; // Update category ID if provided
    product.countInStock = quantity !== undefined ? Number(quantity) : product.countInStock;

    // Update images if new ones were uploaded
    let mainImageUpdated = false;
    if (newOriginalImagePath) {
        product.image = newOriginalImagePath; // Update with new path
        mainImageUpdated = true;
    }

    let additionalImagesUpdated = false;
    if (newOriginalAdditionalImagePaths.length > 0) {
        product.images = newOriginalAdditionalImagePaths; // Replace old paths with new ones
        additionalImagesUpdated = true;
    }

    // Save the updated product
    const updatedProduct = await product.save(); // Triggers pre-save hook for slug update

    // --- Delete old images after successful save ---
    // Delete old main image if a new one was uploaded
    if (mainImageUpdated && oldOriginalImagePath) {
        const oldImageFullPath = getServerFullPath(oldOriginalImagePath);
        if (oldImageFullPath) {
            fs.unlink(oldImageFullPath, (err) => {
                // Log error but don't block response if deletion fails (e.g., file already gone)
                if (err && err.code !== 'ENOENT') { // Ignore 'File not found' errors
                    console.error(`Lỗi khi xóa ảnh đại diện cũ ${oldOriginalImagePath}:`, err);
                }
            });
        }
    }

    // Delete all old additional images if new ones were uploaded
    if (additionalImagesUpdated && oldOriginalAdditionalImagePaths.length > 0) {
        oldOriginalAdditionalImagePaths.forEach((oldImgPath) => {
            const oldAdditionalFullPath = getServerFullPath(oldImgPath);
            if (oldAdditionalFullPath) {
                fs.unlink(oldAdditionalFullPath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error(`Lỗi khi xóa ảnh phụ cũ ${oldImgPath}:`, err);
                    }
                });
            }
        });
    }
    // --- End deleting old images ---


    // Format response
    const responseProduct = {
         ...updatedProduct.toObject(),
        image: getClientImagePath(updatedProduct.image),
        images: updatedProduct.images
            ? updatedProduct.images.map((p) => getClientImagePath(p)).filter((p) => p)
            : [],
        // Recalculate flash sale status for the response
        isActiveFlashSale:
            updatedProduct.isFlashSale &&
            updatedProduct.saleStartDate <= new Date() &&
            updatedProduct.saleEndDate >= new Date(),
        discountedPrice:
            (updatedProduct.isFlashSale &&
             updatedProduct.saleStartDate <= new Date() &&
             updatedProduct.saleEndDate >= new Date())
            ? updatedProduct.price * (1 - updatedProduct.discountPercentage / 100)
            : null,
        discount: updatedProduct.discountPercentage,
    };


    res.json(responseProduct);
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        const originalImagePath = product.image;
        const originalImagePaths = product.images || []; // Ensure it's an array

        // Attempt to delete the main image file
        if (originalImagePath) {
            const imageFullPath = getServerFullPath(originalImagePath);
            if (imageFullPath) {
                fs.unlink(imageFullPath, (err) => {
                    if (err && err.code !== 'ENOENT')
                        console.error(`Lỗi khi xóa ảnh đại diện ${originalImagePath} của sản phẩm bị xóa:`, err);
                });
            }
        }

        // Attempt to delete additional image files
        if (originalImagePaths.length > 0) {
            originalImagePaths.forEach((imgPath) => {
                const additionalImageFullPath = getServerFullPath(imgPath);
                if (additionalImageFullPath) {
                    fs.unlink(additionalImageFullPath, (err) => {
                        if (err && err.code !== 'ENOENT')
                            console.error(`Lỗi khi xóa ảnh phụ ${imgPath} của sản phẩm bị xóa:`, err);
                    });
                }
            });
        }

        // Delete the product document from the database
        await product.deleteOne(); // Use deleteOne() on the document instance
        res.json({ message: 'Sản phẩm đã được xóa thành công' });
    } else {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }
});


// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private (Logged in users)
const createProductReview = asyncHandler(async (req, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    // Basic validation
    if (rating === undefined || rating === null) {
        res.status(400);
        throw new Error('Đánh giá (số sao) là bắt buộc');
    }
    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
        res.status(400);
        throw new Error('Đánh giá phải là số từ 1 đến 5');
    }

    const product = await Product.findById(productId);

    if (product) {
        // Check if the user has already reviewed this product
        const alreadyReviewed = product.reviews.find(
            (r) => r.user.toString() === req.user._id.toString() // Compare user IDs
        );

        if (alreadyReviewed) {
            res.status(400);
            throw new Error('Bạn đã đánh giá sản phẩm này rồi');
        }

        // TODO: Optional - Check if the user has purchased this product before allowing review
        // This would require linking to an Order model

        // Create the review object
        const review = {
            name: req.user.name, // User's name from logged-in user
            rating: numericRating,
            comment: comment || '', // Optional comment
            user: req.user._id, // Link to the user ID
        };

        // Add the review to the product's reviews array
        product.reviews.push(review);

        // Update the number of reviews and the average rating
        product.numReviews = product.reviews.length;
        product.rating =
            product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

        // Save the product with the new review
        await product.save();
        res.status(201).json({ message: 'Thêm đánh giá thành công' });
    } else {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }
});


// @desc    Get top rated products
// @route   GET /api/products/top
// @access  Public
const getTopProducts = asyncHandler(async (req, res) => {
    await disableExpiredFlashSales(); // Ensure flash sale status is up-to-date

    // Find top 5 products sorted by rating descending
    const topProductsFromDB = await Product.find({})
        .sort({ rating: -1 }) // Sort by rating descending
        .limit(5) // Limit to 5 products
        .select('name slug price image rating numReviews isFlashSale saleStartDate saleEndDate discountPercentage'); // Select necessary fields

    // Format products for the client
    const topProducts = topProductsFromDB.map((prod) => {
        const prodObj = prod.toObject();
        const isActiveFlashSale =
            prod.isFlashSale &&
            prod.saleStartDate <= new Date() &&
            prod.saleEndDate >= new Date();
        const discountedPrice = isActiveFlashSale
            ? prod.price * (1 - prod.discountPercentage / 100)
            : prod.price;

        return {
            ...prodObj,
            image: getClientImagePath(prod.image),
            discount: prod.discountPercentage,
            discountedPrice: isActiveFlashSale ? discountedPrice : null,
            isActiveFlashSale,
        };
    });

    res.json(topProducts);
});


// Export all controller functions
export {
    getProducts,
    getProductByIdOrSlug,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductReview,
    getTopProducts,
    getProductSuggestions, // <--- Export the new function
};