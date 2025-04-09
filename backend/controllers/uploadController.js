import path from 'path';
import asyncHandler from 'express-async-handler';

// @desc    Upload image file and return path
// @route   POST /api/upload
// @access  Private/Admin (hoặc Private tùy logic)
// Sử dụng middleware 'upload.single('image')' hoặc 'upload.array('images', 5)' trong route
const uploadFile = asyncHandler(async (req, res) => {
    if (!req.file && !req.files) {
        res.status(400);
        throw new Error('No file uploaded');
    }

    if (req.file) {
         // Xử lý upload 1 file
        // Trả về đường dẫn tương đối để frontend sử dụng
        // Thay thế '\' bằng '/' để đảm bảo tương thích trên các HĐH
        const filePath = '/' + req.file.path.replace(/\\/g, '/').replace('backend/', '');
        res.status(201).send({
            message: 'File uploaded successfully',
            filePath: filePath, // Ví dụ: /uploads/products/productImage-1678886400000.jpg
        });
    } else if (req.files) {
        // Xử lý upload nhiều file (vd: product images)
         const filePaths = req.files.map(file => '/' + file.path.replace(/\\/g, '/').replace('backend/', ''));
         res.status(201).send({
             message: 'Files uploaded successfully',
             filePaths: filePaths,
         });
    }

});

export { uploadFile };