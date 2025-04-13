// backend/controllers/categoryController.js
import asyncHandler from 'express-async-handler';
import Category from '../models/categoryModel.js';
import fs from 'fs';
import path from 'path';

// Helper function để tạo đường dẫn truy cập được từ client
const getClientImagePath = (serverPath) => {
    if (!serverPath) return null;
    const normalizedPath = serverPath.replace(/\\/g, '/');
    const clientPath = normalizedPath.replace(/^backend\//, '');
    return clientPath.startsWith('/') ? clientPath : '/' + clientPath;
};

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
    try {
        const { name, slug: inputSlug, description, parent, seoTitle, seoDescription, seoKeywords } = req.body;
        const slug = inputSlug || name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        // Save the full relative path including the 'categories' subdirectory
        const image = req.file ? getClientImagePath(req.file.path) : null; // e.g., '/uploads/categories/categoryImage-xxx.jpg'

        const slugExists = await Category.findOne({ slug: slug });
        if (slugExists) {
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error("Error deleting uploaded file on slug conflict:", err);
                });
            }
            res.status(400);
            throw new Error(`Slug "${slug}" already exists`);
        }

        const category = new Category({
            name,
            slug,
            description,
            image, // Save the correct client-accessible path
            parent: parent || null,
            seoTitle,
            seoDescription,
            seoKeywords
        });

        const createdCategory = await category.save();
        res.status(201).json(createdCategory);
    } catch (error) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting uploaded file on save error:", err);
            });
        }
        res.status(400);
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
    try {
        const { name, slug: inputSlug, description, parent, seoTitle, seoDescription, seoKeywords } = req.body;
        const image = req.file ? getClientImagePath(req.file.path) : null;

        const category = await Category.findById(req.params.id);

        if (category) {
            const oldImagePath = category.image;

            let newSlug = category.slug;
            if (inputSlug && inputSlug !== category.slug) {
                const slugExists = await Category.findOne({ slug: inputSlug, _id: { $ne: category._id } });
                if (slugExists) {
                    if (req.file) { fs.unlinkSync(req.file.path); }
                    res.status(400);
                    throw new Error(`Slug "${inputSlug}" already exists`);
                }
                newSlug = inputSlug;
            } else if (!inputSlug && name && name !== category.name) {
                const generatedSlug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
                if (generatedSlug !== category.slug) {
                    const slugExists = await Category.findOne({ slug: generatedSlug, _id: { $ne: category._id } });
                    if (slugExists) {
                        if (req.file) { fs.unlinkSync(req.file.path); }
                        res.status(400);
                        throw new Error(`Generated slug "${generatedSlug}" from new name already exists`);
                    }
                    newSlug = generatedSlug;
                }
            }

            category.name = name || category.name;
            category.slug = newSlug;
            category.description = description !== undefined ? description : category.description;
            category.parent = parent !== undefined ? (parent || null) : category.parent;
            category.seoTitle = seoTitle !== undefined ? seoTitle : category.seoTitle;
            category.seoDescription = seoDescription !== undefined ? seoDescription : category.seoDescription;
            category.seoKeywords = seoKeywords !== undefined ? seoKeywords : category.seoKeywords;

            if (image) {
                category.image = image;

                if (oldImagePath && oldImagePath !== '/uploads/categories/default.png') {
                    const __dirname = path.resolve();
                    const oldFileSystemPath = path.join(__dirname, 'backend', oldImagePath.replace('/', '/'));
                    fs.unlink(oldFileSystemPath, (err) => {
                        if (err && err.code !== 'ENOENT') {
                            console.error("Error deleting old category image:", err);
                        }
                    });
                }
            }

            const updatedCategory = await category.save();
            res.json(updatedCategory);
        } else {
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error("Error deleting uploaded file when category not found:", err);
                });
            }
            res.status(404);
            throw new Error('Category not found');
        }
    } catch (error) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting uploaded file on update save error:", err);
            });
        }
        res.status(400);
        throw new Error(`Could not update category: ${error.message}`);
    }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (category) {
        if (category.image && category.image !== '/uploads/categories/default.png') {
            const __dirname = path.resolve();
            const fileSystemPath = path.join(__dirname, 'backend', category.image.replace('/', '/'));
            fs.unlink(fileSystemPath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error("Error deleting category image on category delete:", err);
                }
            });
        }

        await category.deleteOne();
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