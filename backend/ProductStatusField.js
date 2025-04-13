// backend/fixProductStatusField.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import connectDB from './config/db.js';

dotenv.config();
connectDB();

const fixProductStatusField = async () => {
    try {
        await Product.updateMany(
            { status: { $exists: false } },
            {
                $set: {
                    status: 'còn hàng',
                },
            }
        );
        console.log('Updated existing products with status field.');
    } catch (error) {
        console.error('Error updating products:', error);
    } finally {
        mongoose.connection.close();
    }
};

fixProductStatusField();