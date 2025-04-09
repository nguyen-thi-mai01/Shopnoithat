import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path'; // Module path của Node.js
import connectDB from './config/db.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js'; // Import upload route

dotenv.config(); // Load .env file

connectDB(); // Kết nối tới MongoDB

const app = express();

// Middleware cho phép nhận JSON body
app.use(express.json());

// Middleware cho CORS (Cross-Origin Resource Sharing)
// Cấu hình chi tiết hơn nếu cần (ví dụ chỉ cho phép origin từ frontend)
app.use(cors());

// --- API Routes ---
app.get('/api', (req, res) => {
  res.send('API is running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/upload', uploadRoutes); // Sử dụng upload route

// --- Serving Static Files ---
const __dirname = path.resolve(); // Lấy đường dẫn thư mục gốc của project

// Làm cho thư mục 'uploads' có thể truy cập công khai
// Ví dụ: /uploads/logo/logo.png sẽ truy cập file trong backend/uploads/logo/logo.png
app.use('/uploads', express.static(path.join(__dirname, '/backend/uploads')));

// --- Deployment Configuration ---
if (process.env.NODE_ENV === 'production') {
  // Set thư mục build của frontend làm static folder
  app.use(express.static(path.join(__dirname, '/frontend/build')));

  // Bất kỳ route nào không phải API sẽ được chuyển hướng về index.html của frontend
  app.get('*', (req, res) =>
    res.sendFile(path.resolve(__dirname, 'frontend', 'build', 'index.html'))
  );
} else {
  // Ở development mode, chỉ cần API
  app.get('/', (req, res) => {
    res.send('API is running in development mode...');
  });
}


// --- Error Handling Middleware ---
app.use(notFound); // Middleware cho lỗi 404 (phải đặt sau các routes)
app.use(errorHandler); // Middleware xử lý lỗi chung (phải đặt cuối cùng)


// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  )
);