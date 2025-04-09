// Middleware cho lỗi 404 Not Found
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error); // Chuyển lỗi đến error handler tiếp theo
  };
  
  // Middleware xử lý lỗi chung
  const errorHandler = (err, req, res, next) => {
    // Đôi khi lỗi có status code 200 nhưng vẫn là lỗi, set lại 500
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
      message: err.message,
      // Chỉ hiển thị stack trace khi ở môi trường development
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  };
  
  export { notFound, errorHandler };