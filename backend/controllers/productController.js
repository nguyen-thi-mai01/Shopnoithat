// backend/controllers/productController.js
import asyncHandler from 'express-async-handler';
import Product from '../models/productModel.js';
import Category from '../models/categoryModel.js';
import fs from 'fs';
import path from 'path';
import slugify from 'slugify';
import mongoose from 'mongoose'; // Import mongoose để kiểm tra CastError

// Helper function to create a client-accessible path
const getClientImagePath = (serverPath) => {
  if (!serverPath) return null;
  // Đảm bảo luôn dùng / và loại bỏ prefix không cần thiết (nếu có)
  const normalizedPath = serverPath.replace(/\\/g, '/');
  const clientPath = normalizedPath.replace(/^backend\/uploads\//, '/uploads/'); // Thích ứng nếu path lưu có 'backend'
  return clientPath.startsWith('/') ? clientPath : '/' + clientPath;
};

// Helper function to get the full server path for file operations
const getServerFullPath = (relativePath) => {
  if (!relativePath) return null;
  const __dirname = path.resolve(); // Lấy thư mục gốc của dự án backend
  // Đảm bảo relativePath bắt đầu từ gốc uploads nếu cần
  // Ví dụ: nếu relativePath là '/uploads/products/img.jpg'
  // path.join sẽ xử lý đúng trên các OS
  // Nếu relativePath là 'backend/uploads/...' thì cần xử lý thêm nếu __dirname đã là thư mục gốc dự án
  let finalPath = relativePath;
  // Chuẩn hóa về dùng path separator của hệ thống cho fs operations
  finalPath = finalPath.replace(/\//g, path.sep);
  return path.join(__dirname, finalPath);
};

// >>> NEU: Helper function to normalize path before saving to DB <<<
const normalizePathForDB = (filePath) => {
  if (!filePath) return null;
  // Luôn lưu dạng dùng '/' và loại bỏ các prefix không mong muốn (vd: 'backend')
  let normalizedPath = filePath.replace(/\\/g, '/');
  // Ví dụ: nếu multer lưu path là 'backend/uploads/products/img.jpg'
  // và bạn muốn lưu '/uploads/products/img.jpg' vào DB
  if (normalizedPath.startsWith('backend/')) {
    normalizedPath = normalizedPath.substring('backend'.length);
  }
  return normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath;
};


// Helper function to disable expired Flash Sales
const disableExpiredFlashSales = async () => {
  try {
    const now = new Date();
    await Product.updateMany(
      {
        isFlashSale: true,
        saleEndDate: { $lt: now },
      },
      {
        $set: {
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
  }
};

// @desc    Fetch product suggestions based on keyword
// @route   GET /api/products/suggestions
// @access  Public
const getProductSuggestions = asyncHandler(async (req, res) => {
  const keyword = req.query.keyword ? req.query.keyword.trim() : '';
  const limit = parseInt(req.query.limit) || 5;

  if (!keyword) {
    return res.json([]);
  }

  try {
    const suggestions = await Product.find({
      name: { $regex: keyword, $options: 'i' },
    })
      .limit(limit)
      .select('_id name slug image price'); // Lấy các trường cần thiết

    const formattedSuggestions = suggestions.map((product) => ({
      _id: product._id,
      name: product.name,
      slug: product.slug,
      image: getClientImagePath(product.image), // Dùng helper để format
      price: product.price,
    }));

    res.json(formattedSuggestions);
  } catch (error) {
    console.error('Error fetching product suggestions:', error);
    res.status(500).json({ message: 'Lỗi khi lấy gợi ý sản phẩm' });
  }
});


// @desc    Fetch all products (with filter, sort, pagination)
// @route   GET /api/products
// @access  Public or Admin
const getProducts = asyncHandler(async (req, res) => {
    await disableExpiredFlashSales(); // Luôn kiểm tra flash sale

    const page = Number(req.query.pageNumber) || Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    let filters = {};
    if (req.query.keyword) {
        filters.name = { $regex: req.query.keyword, $options: 'i' };
    }
    if (req.query.category) {
        const category = await Category.findOne({ slug: req.query.category });
        if (category) {
            filters.category = category._id;
        } else {
             return res.json({ products: [], page: 1, pages: 0, count: 0, totalProducts: 0, totalPages: 1 });
        }
    }
    const minPrice = req.query['price[gte]'] ? Number(req.query['price[gte]']) : null;
    const maxPrice = req.query['price[lte]'] ? Number(req.query['price[lte]']) : null;
    if (minPrice !== null || maxPrice !== null) {
        filters.price = {};
        if (minPrice !== null) filters.price.$gte = minPrice;
        if (maxPrice !== null) filters.price.$lte = maxPrice;
    }
    if (req.query.isFlashSale === 'true') {
        filters.isFlashSale = true;
        filters.saleStartDate = { $lte: new Date() };
        filters.saleEndDate = { $gte: new Date() };
        filters.remainingFlashSaleSlots = { $gt: 0 };
    }
     if (req.query.status) {
        if (req.query.status === 'In Stock') {
            filters.countInStock = { $gt: 0 };
        } else if (req.query.status === 'Out of Stock') {
            filters.countInStock = 0;
        } else if (req.query.status === 'New Arrival') {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            filters.createdAt = { $gte: oneMonthAgo };
        }
     }

    let sortOptions = { createdAt: -1 };
    const sortBy = req.query.sortBy;
    if (sortBy === 'price-asc') sortOptions = { price: 1 };
    else if (sortBy === 'price-desc') sortOptions = { price: -1 };
    else if (sortBy === 'latest') sortOptions = { createdAt: -1 };
    else if (sortBy === 'rating') sortOptions = { rating: -1 };

    try {
        const count = await Product.countDocuments(filters);
        const productsFromDB = await Product.find(filters)
            .populate('category', 'id name slug')
            .sort(sortOptions)
            .limit(limit)
            .skip(skip);

        const products = productsFromDB.map((product) => {
            const productObj = product.toObject();
            const isActiveFlashSale = product.isFlashSale && product.saleStartDate <= new Date() && product.saleEndDate >= new Date();
            const discountedPrice = isActiveFlashSale ? product.price * (1 - product.discountPercentage / 100) : product.price;
            return {
                ...productObj,
                image: getClientImagePath(product.image), // Format path
                images: product.images ? product.images.map(getClientImagePath).filter(p => p) : [], // Format paths
                discount: product.discountPercentage,
                discountedPrice: isActiveFlashSale ? discountedPrice : null,
                isActiveFlashSale,
            };
        });

        const totalPages = Math.ceil(count / limit);

        res.json({
            products,
            page,
            pages: totalPages,
            count,
            totalProducts: count,
            totalPages: totalPages
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Lỗi máy chủ khi tải sản phẩm." });
    }
});

// @desc    Fetch single product by ID or Slug
// @route   GET /api/products/:idOrSlug
// @access  Public
const getProductByIdOrSlug = asyncHandler(async (req, res) => {
  try {
    await disableExpiredFlashSales();

    const idOrSlug = req.params.idOrSlug;
    let productFromDB;

    if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      productFromDB = await Product.findById(idOrSlug)
        .populate('category', 'id name slug')
        .populate('reviews.user', 'id name');
    } else {
      productFromDB = await Product.findOne({ slug: idOrSlug })
        .populate('category', 'id name slug')
        .populate('reviews.user', 'id name');
    }

    if (!productFromDB) {
      res.status(404);
      throw new Error('Sản phẩm không tồn tại');
    }
     if (!productFromDB.category) {
        console.warn(`Product ${productFromDB._id} has a missing or invalid category reference.`);
     }

    const relatedFromDB = productFromDB.category ? await Product.find({
      category: productFromDB.category._id,
      _id: { $ne: productFromDB._id },
    })
      .limit(4)
      .select('name slug price image rating numReviews isFlashSale saleStartDate saleEndDate discountPercentage') : [];

    const productObj = productFromDB.toObject();
    const isActiveFlashSale = productFromDB.isFlashSale && productFromDB.saleStartDate <= new Date() && productFromDB.saleEndDate >= new Date();
    const discountedPrice = isActiveFlashSale ? productFromDB.price * (1 - productFromDB.discountPercentage / 100) : productFromDB.price;
    const product = {
        ...productObj,
        image: getClientImagePath(productFromDB.image), // Format path
        images: productFromDB.images ? productFromDB.images.map(getClientImagePath).filter(p => p) : [], // Format paths
        discount: productFromDB.discountPercentage,
        discountedPrice: isActiveFlashSale ? discountedPrice : null,
        isActiveFlashSale,
    };

     const relatedProducts = relatedFromDB.map((relProd) => {
        const relProdObj = relProd.toObject();
        const relIsActiveFlashSale = relProd.isFlashSale && relProd.saleStartDate <= new Date() && relProd.saleEndDate >= new Date();
        const relDiscountedPrice = relIsActiveFlashSale ? relProd.price * (1 - relProd.discountPercentage / 100) : relProd.price;
        return {
            ...relProdObj,
            image: getClientImagePath(relProd.image), // Format path
            discount: relProd.discountPercentage,
            discountedPrice: relIsActiveFlashSale ? relDiscountedPrice : null,
            isActiveFlashSale: relIsActiveFlashSale,
        };
     });

    res.json({ ...product, relatedProducts });

  } catch (error) {
    console.error(`Error fetching product ${req.params.idOrSlug}:`, error);
    if (error instanceof mongoose.Error.CastError) {
        res.status(404);
        throw new Error('Định dạng ID hoặc Slug không hợp lệ');
    }
    throw error;
  }
});


// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
    const {
        name, price, description, category, quantity,
        isFlashSale = false, discountPercentage = 0, saleStartDate, saleEndDate, totalFlashSaleSlots = 0
    } = req.body;

    if (!name || !price || !description || !category || quantity === undefined || quantity === null) {
        res.status(400);
        throw new Error('Vui lòng cung cấp đầy đủ thông tin bắt buộc: tên, giá, mô tả, danh mục, số lượng.');
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
        res.status(400);
        throw new Error('Danh mục không hợp lệ.');
    }

    let mainImageOriginalPath = null;
    let additionalImagesOriginalPaths = [];

    if (req.files) {
        if (req.files.image && req.files.image[0]) {
             mainImageOriginalPath = req.files.image[0].path;
        }
        if (req.files.images && req.files.images.length > 0) {
             additionalImagesOriginalPaths = req.files.images.map(file => file.path);
        }
    }

     let flashSaleData = {};
     if (isFlashSale === true || isFlashSale === 'true') {
        if (!discountPercentage || discountPercentage <= 0 || !saleStartDate || !saleEndDate || !totalFlashSaleSlots || totalFlashSaleSlots <= 0) {
            res.status(400);
            throw new Error('Flash Sale yêu cầu: % giảm giá > 0, ngày bắt đầu/kết thúc, và số lượng > 0.');
        }
        if (new Date(saleEndDate) <= new Date(saleStartDate)) {
            res.status(400);
            throw new Error('Ngày kết thúc Flash Sale phải sau ngày bắt đầu.');
        }
        flashSaleData = {
            isFlashSale: true,
            discountPercentage: Number(discountPercentage),
            saleStartDate: new Date(saleStartDate),
            saleEndDate: new Date(saleEndDate),
            totalFlashSaleSlots: Number(totalFlashSaleSlots),
            remainingFlashSaleSlots: Number(totalFlashSaleSlots),
        };
     } else {
         flashSaleData = {
             isFlashSale: false,
             discountPercentage: 0,
             saleStartDate: null,
             saleEndDate: null,
             totalFlashSaleSlots: 0,
             remainingFlashSaleSlots: 0,
         };
     }

    const product = new Product({
        name,
        slug: slugify(name, { lower: true, strict: true }),
        user: req.user._id,
        price: Number(price),
        description,
        category: category,
        countInStock: Number(quantity),
        // >>> SỬA Ở ĐÂY: Chuẩn hóa đường dẫn trước khi lưu <<<
        image: normalizePathForDB(mainImageOriginalPath),
        images: additionalImagesOriginalPaths.map(normalizePathForDB),
        // >>> HẾT SỬA <<<
        ...flashSaleData,
    });

    try {
        const createdProduct = await product.save();

        // Format lại path cho client (dù đã chuẩn hóa DB, vẫn nên dùng)
        const formattedProduct = {
            ...createdProduct.toObject(),
            image: getClientImagePath(createdProduct.image),
            images: createdProduct.images ? createdProduct.images.map(getClientImagePath).filter(p => p) : []
        };
        res.status(201).json(formattedProduct);
    } catch (error) {
        if (error.code === 11000 || error.name === 'ValidationError') {
            res.status(400);
        } else {
            res.status(500);
        }
        console.error("Error creating product:", error);
        // Cẩn thận khi xóa ảnh nếu tạo lỗi - đảm bảo đường dẫn đúng
        if(mainImageOriginalPath) fs.unlink(getServerFullPath(normalizePathForDB(mainImageOriginalPath)), (err) => { if(err) console.error("Error deleting main image on create fail:", err)});
        additionalImagesOriginalPaths.forEach(p => fs.unlink(getServerFullPath(normalizePathForDB(p)), (err) => { if(err) console.error("Error deleting additional image on create fail:", err)}));

        throw new Error(`Không thể tạo sản phẩm: ${error.message}`);
    }
});


// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
    const productId = req.params.id;
    const {
        name, price, description, category, quantity,
        isFlashSale, discountPercentage, saleStartDate, saleEndDate, totalFlashSaleSlots,
        imagesToDelete
    } = req.body;


    const product = await Product.findById(productId);

    if (!product) {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }

    product.name = name || product.name;
    if (name) {
        product.slug = slugify(name, { lower: true, strict: true });
    }
    product.price = price !== undefined ? Number(price) : product.price;
    product.description = description || product.description;
    product.countInStock = quantity !== undefined ? Number(quantity) : product.countInStock;

    if (category) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            res.status(400);
            throw new Error('Danh mục không hợp lệ.');
        }
        product.category = category;
    }

    let newMainImageOriginalPath = null;
    let newAdditionalImagesOriginalPaths = [];

    // Xử lý ảnh chính mới
    if (req.files && req.files.image && req.files.image[0]) {
        newMainImageOriginalPath = req.files.image[0].path;
        const oldMainImageServerPath = getServerFullPath(product.image); // Lấy path cũ để xóa
        if (oldMainImageServerPath) {
           fs.unlink(oldMainImageServerPath, (err) => { if(err) console.error("Error deleting old main image:", err)});
        }
        // >>> SỬA Ở ĐÂY: Chuẩn hóa ảnh chính mới <<<
        product.image = normalizePathForDB(newMainImageOriginalPath);
    }

    // Xử lý ảnh phụ mới
    if (req.files && req.files.images && req.files.images.length > 0) {
        newAdditionalImagesOriginalPaths = req.files.images.map(file => file.path);
        // >>> SỬA Ở ĐÂY: Chuẩn hóa ảnh phụ mới <<<
        const normalizedNewPaths = newAdditionalImagesOriginalPaths.map(normalizePathForDB);
        product.images = product.images ? [...product.images, ...normalizedNewPaths] : normalizedNewPaths;
    }

    // Xử lý xóa ảnh phụ cũ
    if (imagesToDelete && Array.isArray(imagesToDelete) && imagesToDelete.length > 0) {
         const clientPathsToDelete = imagesToDelete;
         const serverPathsToDelete = [];
         const currentImages = product.images || [];

         product.images = currentImages.filter(serverPathDB => {
            const clientPath = getClientImagePath(serverPathDB); // So sánh client path
            if (clientPathsToDelete.includes(clientPath)) {
                serverPathsToDelete.push(serverPathDB); // Lưu server path để xóa file
                return false; // Lọc bỏ
            }
            return true; // Giữ lại
         });

         serverPathsToDelete.forEach(serverPathDB => {
             const fullServerPath = getServerFullPath(serverPathDB); // Lấy đường dẫn tuyệt đối
             if (fullServerPath) {
                fs.unlink(fullServerPath, (err) => { if(err) console.error(`Error deleting additional image ${serverPathDB}:`, err)});
             }
         });
    }


    const isFlashSaleBool = String(isFlashSale).toLowerCase() === 'true';
    if (isFlashSaleBool) {
        if (!discountPercentage || discountPercentage <= 0 || !saleStartDate || !saleEndDate || !totalFlashSaleSlots || totalFlashSaleSlots <= 0) {
            res.status(400);
            throw new Error('Cập nhật Flash Sale yêu cầu: % giảm giá > 0, ngày bắt đầu/kết thúc, và số lượng > 0.');
        }
        if (new Date(saleEndDate) <= new Date(saleStartDate)) {
            res.status(400);
            throw new Error('Ngày kết thúc Flash Sale phải sau ngày bắt đầu.');
        }
        product.isFlashSale = true;
        product.discountPercentage = Number(discountPercentage);
        product.saleStartDate = new Date(saleStartDate);
        product.saleEndDate = new Date(saleEndDate);
        product.totalFlashSaleSlots = Number(totalFlashSaleSlots);
        product.remainingFlashSaleSlots = Number(totalFlashSaleSlots); // Reset lại? Cần xem xét kỹ logic
     } else {
        product.isFlashSale = false;
        product.discountPercentage = 0;
        product.saleStartDate = null;
        product.saleEndDate = null;
        product.totalFlashSaleSlots = 0;
        product.remainingFlashSaleSlots = 0;
     }

    try {
        const updatedProduct = await product.save();
        const formattedProduct = {
            ...updatedProduct.toObject(),
            image: getClientImagePath(updatedProduct.image), // Format path
            images: updatedProduct.images ? updatedProduct.images.map(getClientImagePath).filter(p => p) : [] // Format paths
        };
        res.json(formattedProduct);
    } catch (error) {
        if (error.code === 11000 || error.name === 'ValidationError') {
            res.status(400);
        } else {
            res.status(500);
        }
        console.error("Error updating product:", error);
        // Cẩn thận khi xóa ảnh MỚI nếu update lỗi
        if(newMainImageOriginalPath) fs.unlink(getServerFullPath(normalizePathForDB(newMainImageOriginalPath)), (err) => { if(err) console.error("Error deleting new main image on update fail:", err)});
        newAdditionalImagesOriginalPaths.forEach(p => fs.unlink(getServerFullPath(normalizePathForDB(p)), (err) => { if(err) console.error("Error deleting new additional image on update fail:", err)}));

        throw new Error(`Không thể cập nhật sản phẩm: ${error.message}`);
    }
});


// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
        // Xóa ảnh chính
        if (product.image) {
            const mainImageServerPath = getServerFullPath(product.image);
            if (mainImageServerPath) {
               fs.unlink(mainImageServerPath, (err) => { if(err) console.error(`Error deleting main image for ${product._id}:`, err)});
            }
        }
        // Xóa ảnh phụ
        if (product.images && product.images.length > 0) {
            product.images.forEach(imgPath => {
                const addImageServerPath = getServerFullPath(imgPath);
                if (addImageServerPath) {
                   fs.unlink(addImageServerPath, (err) => { if(err) console.error(`Error deleting additional image ${imgPath} for ${product._id}:`, err)});
                }
            });
        }

        try {
             await product.deleteOne();
             res.json({ message: 'Sản phẩm đã được xóa' });
        } catch(error) {
             console.error(`Error deleting product document ${req.params.id}:`, error);
             res.status(500);
             throw new Error('Lỗi máy chủ khi xóa sản phẩm.');
        }

    } else {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }
});


// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = asyncHandler(async (req, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    if (!rating || !comment) {
         res.status(400);
         throw new Error('Vui lòng cung cấp cả đánh giá (sao) và bình luận.');
    }
     const numericRating = Number(rating);
     if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
         res.status(400);
         throw new Error('Đánh giá phải là số từ 1 đến 5.');
     }


    const product = await Product.findById(productId);

    if (product) {
        const alreadyReviewed = product.reviews.find(
            (r) => r.user.toString() === req.user._id.toString()
        );

        if (alreadyReviewed) {
            res.status(400);
            throw new Error('Bạn đã đánh giá sản phẩm này rồi.');
        }

        const review = {
            name: req.user.name,
            rating: numericRating,
            comment,
            user: req.user._id,
        };

        product.reviews.push(review);
        product.numReviews = product.reviews.length;
        product.rating =
            product.reviews.reduce((acc, item) => item.rating + acc, 0) /
            product.reviews.length;

        await product.save();
        res.status(201).json({ message: 'Đánh giá đã được thêm' });
    } else {
        res.status(404);
        throw new Error('Sản phẩm không tồn tại');
    }
});


// @desc    Get top rated products
// @route   GET /api/products/top
// @access  Public
const getTopProducts = asyncHandler(async (req, res) => {
    await disableExpiredFlashSales();

    const productsFromDB = await Product.find({ countInStock: { $gt: 0 } })
                            .sort({ rating: -1 })
                            .limit(4)
                            .populate('category', 'slug');

     const products = productsFromDB.map((product) => {
        const productObj = product.toObject();
        const isActiveFlashSale = product.isFlashSale && product.saleStartDate <= new Date() && product.saleEndDate >= new Date();
        const discountedPrice = isActiveFlashSale ? product.price * (1 - product.discountPercentage / 100) : product.price;
        return {
            _id: productObj._id,
            name: productObj.name,
            slug: productObj.slug,
            image: getClientImagePath(product.image), // Format path
            price: productObj.price,
            rating: productObj.rating,
            numReviews: productObj.numReviews,
            categorySlug: productObj.category?.slug,
            discountedPrice: isActiveFlashSale ? discountedPrice : null,
            isActiveFlashSale,
        };
     });

    res.json(products);
});


// @desc    Search products based on keyword from header search
// @route   GET /api/products/search
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
    await disableExpiredFlashSales();

    const keyword = req.query.keyword ? req.query.keyword.trim() : '';

    if (!keyword) {
        return res.json({ products: [] });
    }

    const searchFilter = {
        name: {
            $regex: keyword,
            $options: 'i',
        },
    };

    try {
        const productsFromDB = await Product.find(searchFilter)
            .populate('category', 'id name slug')
            .limit(50)
            .sort({ createdAt: -1 });

         const products = productsFromDB.map((product) => {
            const productObj = product.toObject();
            const isActiveFlashSale =
                product.isFlashSale &&
                product.saleStartDate <= new Date() &&
                product.saleEndDate >= new Date();
            const discountedPrice = isActiveFlashSale
                ? product.price * (1 - product.discountPercentage / 100)
                : product.price;

            return {
                ...productObj,
                image: getClientImagePath(product.image), // Format path
                images: product.images
                    ? product.images.map((imgPath) => getClientImagePath(imgPath)).filter((p) => p)
                    : [],
                category: productObj.category,
                discount: product.discountPercentage,
                discountedPrice: isActiveFlashSale ? discountedPrice : null,
                isActiveFlashSale,
            };
         });

        res.json({ products });

    } catch (error) {
        console.error('Error during product search:', error);
        res.status(500).json({ message: 'Lỗi máy chủ khi tìm kiếm sản phẩm.' });
    }
});


// --- Exports ---
export {
    getProducts,
    getProductByIdOrSlug,
    createProduct,
    updateProduct,
    deleteProduct,
    createProductReview,
    getTopProducts,
    getProductSuggestions,
    searchProducts,
    getClientImagePath, // Thêm export này
    normalizePathForDB, // Và export này
};