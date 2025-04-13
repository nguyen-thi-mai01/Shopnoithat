// backend/fixProductFlashSaleFields.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import connectDB from './config/db.js';

dotenv.config();
connectDB();

const fixProductFlashSaleFields = async () => {
  try {
    await Product.updateMany(
      { isFlashSale: { $exists: false } },
      {
        $set: {
          isFlashSale: false,
          discountPercentage: 0,
          saleStartDate: null,
          saleEndDate: null,
        },
      }
    );
    console.log('Updated existing products with Flash Sale fields.');
  } catch (error) {
    console.error('Error updating products:', error);
  } finally {
    mongoose.connection.close();
  }
};

fixProductFlashSaleFields();