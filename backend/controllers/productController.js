import asyncHandler from 'express-async-handler';
import Product from '../models/productModel.js';
import Category from '../models/categoryModel.js';
import fs from 'fs';
import path from 'path';

// Helper function tạo đường dẫn client có thể truy cập
const getClientImagePath = (filePath) => {
  if (!filePath) return null;
  return '/' + filePath.replace(/\\/g, '/').replace('backend/', '');
};

// @desc    Fetch all products (với filter, sort, pagination)
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = 12; // Số sản phẩm mỗi trang
  const page = Number(req.query.pageNumber) || 1; // Trang hiện tại

  // Tìm kiếm theo từ khóa
  const keyword = req.query.keyword
    ? {
        name: {
          $regex: req.query.keyword,
          $options: 'i',
        },
      }
    : {};

  // Lọc theo danh mục
  const categorySlug = req.query.category;
  let categoryFilter = {};
  if (categorySlug) {
    const category = await Category.findOne({ slug: categorySlug });
    if (category) {
      categoryFilter = { category: category._id };
    } else {
      res.json({ products: [], page: 1, pages: 0, count: 0 });
      return;
    }
  }

  // Lọc theo giá
  const minPrice = req.query['price[gte]'] ? Number(req.query['price[gte]']) : 0;
  const maxPrice = req.query['price[lte]'] ? Number(req.query['price[lte]']) : Infinity;
  const priceFilter = { price: { $gte: minPrice, $lte: maxPrice } };

  // Lọc theo chất liệu
  let materialFilter = {};
  if (req.query.material) {
    const materials = req.query.material.split(',').map((m) => m.trim());
    materialFilter = { material: { $in: materials.map((m) => new RegExp(`^${m}$`, 'i')) } };
  }

  // Kết hợp các bộ lọc
  const filters = { ...keyword, ...categoryFilter, ...priceFilter, ...materialFilter };

  // Sắp xếp
  let sortOptions = {};
  const sortBy = req.query.sortBy;
  if (sortBy === 'price-asc') sortOptions = { price: 1 };
  else if (sortBy === 'price-desc') sortOptions = { price: -1 };
  else if (sortBy === 'latest') sortOptions = { createdAt: -1 };
  else if (sortBy === 'rating') sortOptions = { rating: -1 };
  else sortOptions = { createdAt: -1 }; // Mặc định mới nhất

  const count = await Product.countDocuments(filters);
  const products = await Product.find(filters)
    .populate('category', 'id name slug')
    .sort(sortOptions)
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ products, page, pages: Math.ceil(count / pageSize), count });
});

// @desc    Fetch single product by ID or Slug
// @route   GET /api/products/:idOrSlug
// @access  Public
const getProductByIdOrSlug = asyncHandler(async (req, res) => {
  const idOrSlug = req.params.idOrSlug;
  let product;

  if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
    product = await Product.findById(idOrSlug)
      .populate('category', 'id name slug')
      .populate('reviews.user', 'id name');
  } else {
    product = await Product.findOne({ slug: idOrSlug })
      .populate('category', 'id name slug')
      .populate('reviews.user', 'id name');
  }

  if (product) {
    const related = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
    })
      .limit(4)
      .select('name slug price image rating numReviews');

    res.json({ ...product.toObject(), relatedProducts: related });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    price,
    originalPrice,
    brand,
    category,
    quantity,
    description,
    detailedDescription,
    attributes,
    relatedProducts,
    seoTitle,
    seoDescription,
    seoKeywords,
  } = req.body;

  let mainImagePath = null;
  if (req.files && req.files['image'] && req.files['image'][0]) {
    mainImagePath = getClientImagePath(req.files['image'][0].path);
  }

  let additionalImagePaths = [];
  if (req.files && req.files['images'] && req.files['images'].length > 0) {
    additionalImagePaths = req.files['images'].map((file) => getClientImagePath(file.path));
  }

  let parsedAttributes = [];
  if (attributes) {
    try {
      parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
      if (!Array.isArray(parsedAttributes)) parsedAttributes = [];
    } catch (e) {
      console.error('Error parsing attributes:', e);
    }
  }

  let parsedRelatedProducts = [];
  if (relatedProducts) {
    try {
      parsedRelatedProducts =
        typeof relatedProducts === 'string' ? JSON.parse(relatedProducts) : relatedProducts;
      if (!Array.isArray(parsedRelatedProducts)) parsedRelatedProducts = [];
    } catch (e) {
      console.error('Error parsing relatedProducts:', e);
    }
  }

  if (!category || !category.match(/^[0-9a-fA-F]{24}$/)) {
    if (req.files) {
      if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
      if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
    }
    res.status(400);
    throw new Error('Invalid or missing Category ID');
  }

  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    if (req.files) {
      if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
      if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
    }
    res.status(400);
    throw new Error('Category not found');
  }

  const slugToUse = slug || (name ? name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') : '');
  if (!slugToUse) {
    if (req.files) {
      if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
      if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
    }
    res.status(400);
    throw new Error('Product name is required to generate slug');
  }

  const slugExists = await Product.findOne({ slug: slugToUse });
  if (slugExists) {
    if (req.files) {
      if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
      if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
    }
    res.status(400);
    throw new Error(`Slug "${slugToUse}" already exists`);
  }

  const product = new Product({
    user: req.user._id,
    name,
    slug: slugToUse,
    price: Number(price) || 0,
    originalPrice: originalPrice ? Number(originalPrice) : Number(price || 0),
    image: mainImagePath || '/images/sample.jpg',
    images: additionalImagePaths || [],
    brand: brand || 'Chưa xác định',
    category,
    countInStock: Number(quantity) || 0,
    numReviews: 0,
    rating: 0,
    description,
    detailedDescription,
    attributes: parsedAttributes,
    relatedProducts: parsedRelatedProducts,
    seoTitle,
    seoDescription,
    seoKeywords,
  });

  try {
    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    if (req.files) {
      if (req.files['image']?.[0])
        fs.unlink(req.files['image'][0].path, (err) => {
          if (err) console.error('Error deleting image on save fail:', err);
        });
      if (req.files['images']?.length > 0) {
        req.files['images'].forEach((f) =>
          fs.unlink(f.path, (err) => {
            if (err) console.error('Error deleting images on save fail:', err);
          })
        );
      }
    }
    res.status(400);
    console.error('Error saving product:', error);
    throw new Error(`Could not create product: ${error.message}`);
  }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    price,
    originalPrice,
    brand,
    category,
    quantity,
    description,
    detailedDescription,
    attributes,
    relatedProducts,
    seoTitle,
    seoDescription,
    seoKeywords,
    removeCurrentImage,
    imagesToRemove,
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    if (req.files) {
      if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
      if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
    }
    res.status(404);
    throw new Error('Product not found');
  }

  const __dirname = path.resolve();
  const oldMainImagePath = product.image;
  let mainImageNeedsUpdate = false;

  if (removeCurrentImage === 'true' || removeCurrentImage === true) {
    product.image = '/images/sample.jpg';
    mainImageNeedsUpdate = true;
  }

  if (req.files && req.files['image'] && req.files['image'][0]) {
    product.image = getClientImagePath(req.files['image'][0].path);
    mainImageNeedsUpdate = true;
  }

  if (
    mainImageNeedsUpdate &&
    oldMainImagePath &&
    oldMainImagePath !== product.image &&
    oldMainImagePath !== '/images/sample.jpg'
  ) {
    const oldFileSystemPath = path.join(
      __dirname,
      'backend',
      oldMainImagePath.startsWith('/') ? oldMainImagePath.substring(1) : oldMainImagePath
    );
    fs.unlink(oldFileSystemPath, (err) => {
      if (err && err.code !== 'ENOENT') console.error('Error deleting old product main image:', err);
    });
  }

  let currentAdditionalImages = product.images || [];
  let imagesNeedUpdate = false;

  if (imagesToRemove) {
    let pathsToRemove = [];
    try {
      pathsToRemove = typeof imagesToRemove === 'string' ? JSON.parse(imagesToRemove) : imagesToRemove;
      if (!Array.isArray(pathsToRemove)) pathsToRemove = [];
    } catch (e) {
      console.error('Error parsing imagesToRemove:', e);
      pathsToRemove = [];
    }

    if (pathsToRemove.length > 0) {
      pathsToRemove.forEach((pathToRemove) => {
        if (pathToRemove && pathToRemove !== '/images/sample.jpg') {
          const fileSystemPath = path.join(
            __dirname,
            'backend',
            pathToRemove.startsWith('/') ? pathToRemove.substring(1) : pathToRemove
          );
          fs.unlink(fileSystemPath, (err) => {
            if (err && err.code !== 'ENOENT')
              console.error(`Error deleting additional image ${pathToRemove}:`, err);
          });
        }
      });
      currentAdditionalImages = currentAdditionalImages.filter((p) => !pathsToRemove.includes(p));
      imagesNeedUpdate = true;
    }
  }

  if (req.files && req.files['images'] && req.files['images'].length > 0) {
    const uploadedPaths = req.files['images'].map((file) => getClientImagePath(file.path));
    currentAdditionalImages = [...currentAdditionalImages, ...uploadedPaths];
    imagesNeedUpdate = true;
  }

  if (imagesNeedUpdate) {
    product.images = currentAdditionalImages;
  }

  if (category && category !== product.category.toString()) {
    if (!category.match(/^[0-9a-fA-F]{24}$/)) {
      if (req.files) {
        if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
        if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
      }
      res.status(400);
      throw new Error('Invalid Category ID format');
    }
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      if (req.files) {
        if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
        if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
      }
      res.status(400);
      throw new Error('Category not found');
    }
    product.category = category;
  }

  const slugToUse = slug || (name ? name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') : product.slug);
  if (slugToUse !== product.slug) {
    if (!slugToUse) {
      if (req.files) {
        if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
        if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
      }
      res.status(400);
      throw new Error('Slug cannot be empty');
    }
    const slugExists = await Product.findOne({ slug: slugToUse, _id: { $ne: product._id } });
    if (slugExists) {
      if (req.files) {
        if (req.files['image']?.[0]) fs.unlinkSync(req.files['image'][0].path);
        if (req.files['images']?.length > 0) req.files['images'].forEach((f) => fs.unlinkSync(f.path));
      }
      res.status(400);
      throw new Error(`Slug "${slugToUse}" already exists`);
    }
    product.slug = slugToUse;
  }

  product.name = name || product.name;
  product.price = price !== undefined ? Number(price) : product.price;
  product.originalPrice = originalPrice !== undefined ? Number(originalPrice) : product.originalPrice;
  product.brand = brand || product.brand;
  product.countInStock = quantity !== undefined ? Number(quantity) : product.countInStock;
  product.description = description !== undefined ? description : product.description;
  product.detailedDescription = detailedDescription !== undefined ? detailedDescription : product.detailedDescription;

  if (attributes !== undefined) {
    try {
      product.attributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
    } catch (e) {}
  }
  if (relatedProducts !== undefined) {
    try {
      product.relatedProducts =
        typeof relatedProducts === 'string' ? JSON.parse(relatedProducts) : relatedProducts;
    } catch (e) {}
  }

  product.seoTitle = seoTitle !== undefined ? seoTitle : product.seoTitle;
  product.seoDescription = seoDescription !== undefined ? seoDescription : product.seoDescription;
  product.seoKeywords = seoKeywords !== undefined ? seoKeywords : product.seoKeywords;

  try {
    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    if (req.files) {
      if (req.files['image']?.[0])
        fs.unlink(req.files['image'][0].path, (err) => {
          if (err) console.error('Err del img on update fail:', err);
        });
      if (req.files['images']?.length > 0)
        req.files['images'].forEach((f) =>
          fs.unlink(f.path, (err) => {
            if (err) console.error('Err del imgs on update fail:', err);
          })
        );
    }
    res.status(400);
    console.error('Error updating product:', error);
    throw new Error(`Could not update product: ${error.message}`);
  }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  const __dirname = path.resolve();

  if (product) {
    if (product.image && product.image !== '/images/sample.jpg') {
      const imagePath = path.join(
        __dirname,
        'backend',
        product.image.startsWith('/') ? product.image.substring(1) : product.image
      );
      fs.unlink(imagePath, (err) => {
        if (err && err.code !== 'ENOENT') console.error('Error deleting product main image:', err);
      });
    }
    if (product.images && product.images.length > 0) {
      product.images.forEach((imgPath) => {
        if (imgPath) {
          const additionalImagePath = path.join(
            __dirname,
            'backend',
            imgPath.startsWith('/') ? imgPath.substring(1) : imgPath
          );
          fs.unlink(additionalImagePath, (err) => {
            if (err && err.code !== 'ENOENT')
              console.error(`Error deleting additional product image ${imgPath}:`, err);
          });
        }
      });
    }

    await product.deleteOne();
    res.json({ message: 'Product removed successfully' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const productId = req.params.id;

  if (!rating) {
    res.status(400);
    throw new Error('Rating is required');
  }

  const product = await Product.findById(productId);

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      res.status(400);
      throw new Error('Product already reviewed');
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment: comment || '',
      user: req.user._id,
    };

    product.reviews.push(review);
    product.numReviews = product.reviews.length;
    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

    await product.save();
    res.status(201).json({ message: 'Review added successfully' });
  } else {
    res.status(404);
    throw new Error('Product not found');
  }
});

// @desc    Get top rated products
// @route   GET /api/products/top
// @access  Public
const getTopProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({})
    .sort({ rating: -1 })
    .limit(5)
    .select('name slug price image rating numReviews');

  res.json(products);
});

export {
  getProducts,
  getProductByIdOrSlug,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview,
  getTopProducts,
};