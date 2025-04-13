// backend/fixCategoryImagePaths.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/categoryModel.js'; // Adjust the path as needed
import connectDB from './config/db.js'; // Adjust the path as needed

dotenv.config();
connectDB();

const fixCategoryImagePaths = async () => {
    try {
        const categories = await Category.find({});
        for (let category of categories) {
            if (category.image && category.image.startsWith('/uploads/') && !category.image.includes('/uploads/categories/')) {
                // Fix the path by inserting 'categories/'
                const fileName = category.image.split('/uploads/')[1];
                category.image = `/uploads/categories/${fileName}`;
                await category.save();
                console.log(`Updated image path for category ${category.name}: ${category.image}`);
            }
        }
        console.log('Finished fixing category image paths.');
    } catch (error) {
        console.error('Error fixing category image paths:', error);
    } finally {
        mongoose.connection.close();
    }
};

fixCategoryImagePaths();