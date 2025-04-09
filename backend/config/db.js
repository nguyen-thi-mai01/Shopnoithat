import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Load biến môi trường

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Các tùy chọn này không còn cần thiết trong Mongoose 6+
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // useCreateIndex: true, // Không còn được hỗ trợ
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Thoát tiến trình nếu không kết nối được DB
  }
};

export default connectDB;