// backend/middleware/uploadMiddleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Đảm bảo thư mục uploads và các thư mục con cần thiết tồn tại
const uploadDir = 'backend/uploads';
const directoriesToEnsure = [
    uploadDir,
    path.join(uploadDir, 'logo'),
    path.join(uploadDir, 'products'),
    path.join(uploadDir, 'categories')
];

directoriesToEnsure.forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Directory created: ${dir}`);
        } catch (err) {
            console.error(`Error creating directory ${dir}:`, err);
            // Có thể cần xử lý lỗi nghiêm trọng hơn ở đây nếu không tạo được thư mục
        }
    }
});

// Cấu hình lưu trữ file
const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Xác định thư mục đích dựa vào fieldname
    let dest = 'backend/uploads/'; // Thư mục mặc định

    if (file.fieldname === 'logoImage') {
        dest = 'backend/uploads/logo/';
    } else if (file.fieldname === 'image' || file.fieldname === 'images') { // <<< SỬA Ở ĐÂY: Dùng 'image' thay vì 'productImage'
        dest = 'backend/uploads/products/';
    } else if (file.fieldname === 'categoryImage') {
        dest = 'backend/uploads/categories/';
    }
    // Thêm các điều kiện else if khác cho các loại file upload khác nếu có

    // Kiểm tra lại xem thư mục đích có thực sự tồn tại không trước khi gọi cb
    if (!fs.existsSync(dest)) {
        try {
            fs.mkdirSync(dest, { recursive: true });
        } catch (err) {
             console.error(`Failed to create destination directory ${dest} on the fly:`, err);
             return cb(new Error(`Could not ensure destination directory ${dest} exists.`)); // Trả về lỗi nếu không tạo được
        }
    }

    cb(null, dest); // Trả về thư mục đích đã xác định
  },
  filename(req, file, cb) {
    // Tạo tên file unique để tránh ghi đè và xung đột tên
    // Làm sạch tên file gốc để tránh các ký tự không hợp lệ
    const safeOriginalName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); // Thêm phần ngẫu nhiên để tăng độ unique
    const fileExtension = path.extname(file.originalname).toLowerCase();

    cb(
      null,
      `${file.fieldname}-${safeOriginalName}-${uniqueSuffix}${fileExtension}`
    );
  },
});

// Hàm kiểm tra loại file (chỉ cho phép ảnh)
function checkFileType(file, cb) {
  // Các loại file ảnh hợp lệ (có thể tùy chỉnh)
  const filetypes = /jpeg|jpg|png|gif|webp/;
  // Kiểm tra phần mở rộng file (extension)
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Kiểm tra kiểu MIME
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true); // File hợp lệ
  } else {
    // File không hợp lệ, trả về lỗi
    cb(new Error('Lỗi: Chỉ được phép tải lên file ảnh (jpeg, jpg, png, gif, webp)!'));
  }
}

// Khởi tạo middleware Multer với cấu hình storage, fileFilter và giới hạn kích thước
const upload = multer({
  storage: storage, // Sử dụng cấu hình storage đã định nghĩa
  fileFilter: function (req, file, cb) {
    // Sử dụng hàm checkFileType để lọc file
    checkFileType(file, cb);
  },
  limits: {
      fileSize: 10 * 1024 * 1024 // Giới hạn kích thước file (ví dụ: 10MB)
  }
});

// Export middleware đã cấu hình
export default upload;