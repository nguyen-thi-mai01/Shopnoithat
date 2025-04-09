// backend/controllers/categoryController.js
import asyncHandler from 'express-async-handler';
import Category from '../models/categoryModel.js';
import fs from 'fs'; // Import fs để xử lý file (nếu cần xóa file cũ)
import path from 'path'; // Import path

// Helper function để tạo đường dẫn truy cập được từ client
const getClientImagePath = (filePath) => {
    if (!filePath) return null;
    // Thay thế '\' bằng '/' và loại bỏ phần 'backend'
    return '/' + filePath.replace(/\\/g, '/').replace('backend/', '');
}

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  // Lấy dữ liệu từ req.body, loại bỏ 'image' vì nó sẽ đến từ req.file
  const { name, slug: inputSlug, description, parent, seoTitle, seoDescription, seoKeywords } = req.body;

  // Xác định slug: sử dụng slug người dùng cung cấp hoặc tạo tự động
  const slug = inputSlug || name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

  // Kiểm tra slug đã tồn tại chưa
  const slugExists = await Category.findOne({ slug: slug });
  if (slugExists) {
    // Nếu có file upload kèm theo mà slug lỗi, cần xóa file đã upload
    if (req.file) {
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting uploaded file on slug conflict:", err);
        });
    }
    res.status(400);
    throw new Error(`Slug "${slug}" already exists`);
  }

  // Lấy đường dẫn ảnh từ file đã upload (nếu có)
  const imagePath = req.file ? getClientImagePath(req.file.path) : null;

  const category = new Category({
    name,
    slug, // Sử dụng slug đã xác định
    description,
    image: imagePath, // Lưu đường dẫn có thể truy cập từ client
    parent: parent || null,
    seoTitle,
    seoDescription,
    seoKeywords
  });

  try {
    const createdCategory = await category.save();
    res.status(201).json(createdCategory);
  } catch (error) {
     // Nếu lưu lỗi (ví dụ validation), xóa file đã upload nếu có
     if (req.file) {
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting uploaded file on save error:", err);
        });
    }
    res.status(400); // Hoặc mã lỗi phù hợp
    throw new Error(`Could not create category: ${error.message}`);
  }
});

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({}).populate('parent', 'id name slug');
  res.json(categories);
});

// @desc    Get category by ID or Slug
// @route   GET /api/categories/:idOrSlug
// @access  Public
const getCategoryByIdOrSlug = asyncHandler(async (req, res) => {
    const idOrSlug = req.params.idOrSlug;
    let category;

    if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
        category = await Category.findById(idOrSlug).populate('parent', 'id name slug');
    } else {
        category = await Category.findOne({ slug: idOrSlug }).populate('parent', 'id name slug');
    }

    if (category) {
        res.json(category);
    } else {
        res.status(404);
        throw new Error('Category not found');
    }
});


// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  // Lấy dữ liệu từ req.body, loại bỏ 'image'
  const { name, slug: inputSlug, description, parent, seoTitle, seoDescription, seoKeywords } = req.body;

  const category = await Category.findById(req.params.id);

  if (category) {
    // Lưu lại đường dẫn ảnh cũ để có thể xóa nếu có ảnh mới
    const oldImagePath = category.image;

    // Xác định slug mới
    let newSlug = category.slug; // Mặc định giữ slug cũ
    if (inputSlug && inputSlug !== category.slug) {
        // Nếu cung cấp slug mới và khác slug cũ -> kiểm tra trùng
        const slugExists = await Category.findOne({ slug: inputSlug, _id: { $ne: category._id } }); // Tìm slug trùng ở category khác
        if (slugExists) {
            if (req.file) { fs.unlinkSync(req.file.path); } // Xóa file mới upload nếu slug lỗi
            res.status(400);
            throw new Error(`Slug "${inputSlug}" already exists`);
        }
        newSlug = inputSlug;
    } else if (!inputSlug && name && name !== category.name) {
        // Nếu không cung cấp slug nhưng đổi tên -> tạo slug mới từ tên và kiểm tra
        const generatedSlug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        if (generatedSlug !== category.slug) {
             const slugExists = await Category.findOne({ slug: generatedSlug, _id: { $ne: category._id } });
             if (slugExists) {
                if (req.file) { fs.unlinkSync(req.file.path); } // Xóa file mới upload nếu slug lỗi
                res.status(400);
                throw new Error(`Generated slug "${generatedSlug}" from new name already exists`);
             }
             newSlug = generatedSlug;
        }
    }

    // Cập nhật các trường
    category.name = name || category.name;
    category.slug = newSlug; // Cập nhật slug mới
    category.description = description !== undefined ? description : category.description; // Cho phép xóa description
    category.parent = parent !== undefined ? (parent || null) : category.parent; // Cho phép set về null
    category.seoTitle = seoTitle !== undefined ? seoTitle : category.seoTitle;
    category.seoDescription = seoDescription !== undefined ? seoDescription : category.seoDescription;
    category.seoKeywords = seoKeywords !== undefined ? seoKeywords : category.seoKeywords;

    // Xử lý ảnh mới (nếu có)
    if (req.file) {
        const newImagePath = getClientImagePath(req.file.path);
        category.image = newImagePath; // Cập nhật đường dẫn ảnh mới

        // (Tùy chọn nâng cao) Xóa ảnh cũ nếu nó tồn tại và không phải ảnh mặc định
        if (oldImagePath && oldImagePath !== '/uploads/categories/default.png') {
             // Cần chuyển đổi đường dẫn client (/uploads/...) thành đường dẫn hệ thống (backend/uploads/...)
             const __dirname = path.resolve();
             const oldFileSystemPath = path.join(__dirname, oldImagePath.replace('/', '/backend/')); // Chỉnh sửa lại cho đúng cấu trúc
             fs.unlink(oldFileSystemPath, (err) => {
                 if (err && err.code !== 'ENOENT') { // Bỏ qua lỗi nếu file không tồn tại
                    console.error("Error deleting old category image:", err);
                 }
             });
        }
    }

    try {
        const updatedCategory = await category.save();
        res.json(updatedCategory);
    } catch (error) {
        // Nếu lưu lỗi, xóa file mới upload nếu có
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting uploaded file on update save error:", err);
            });
        }
        res.status(400);
        throw new Error(`Could not update category: ${error.message}`);
    }

  } else {
     // Nếu không tìm thấy category, xóa file đã upload nếu có
     if (req.file) {
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting uploaded file when category not found:", err);
        });
    }
    res.status(404);
    throw new Error('Category not found');
  }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (category) {
    // *** QUAN TRỌNG: Xử lý sản phẩm thuộc danh mục này trước khi xóa ***
    // Nên kiểm tra xem có sản phẩm nào đang sử dụng danh mục này không
    // const productCount = await Product.countDocuments({ category: category._id });
    // if (productCount > 0) {
    //   res.status(400);
    //   throw new Error('Cannot delete category with existing products. Reassign products first.');
    // }

    // (Tùy chọn) Xóa ảnh của danh mục khỏi hệ thống file
    if (category.image && category.image !== '/uploads/categories/default.png') {
        const __dirname = path.resolve();
        const fileSystemPath = path.join(__dirname, category.image.replace('/', '/backend/')); // Chỉnh sửa lại cho đúng cấu trúc
        fs.unlink(fileSystemPath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error("Error deleting category image on category delete:", err);
            }
        });
    }

    await category.deleteOne(); // Sử dụng deleteOne thay vì remove (deprecated)
    res.json({ message: 'Category removed successfully' });
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

export {
  createCategory,
  getCategories,
  getCategoryByIdOrSlug,
  updateCategory,
  deleteCategory,
};