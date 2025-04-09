const admin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
      next(); // User là admin, cho phép tiếp tục
    } else {
      res.status(403); // Forbidden
      throw new Error('Not authorized as an admin');
    }
  };
  
  export { admin };