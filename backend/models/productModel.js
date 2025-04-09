import mongoose from 'mongoose';

const reviewSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true }, // Tên người dùng lúc review
    rating: { type: Number, required: true }, // 1 to 5 stars
    comment: { type: String, required: true },
  },
  { timestamps: true }
);

const productSchema = mongoose.Schema(
  {
    user: { // Người admin tạo sản phẩm
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    image: { type: String, required: true }, // Ảnh đại diện chính
    images: [{ type: String }], // Mảng các ảnh khác
    videos: [{ type: String }], // Mảng link video (hoặc path)
    brand: { type: String }, // Thương hiệu
    category: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Category',
    },
    description: { type: String, required: true }, // Mô tả ngắn
    detailedDescription: { type: String }, // Mô tả chi tiết (có thể dùng editor)
    reviews: [reviewSchema],
    rating: { // Đánh giá trung bình
      type: Number,
      required: true,
      default: 0,
    },
    numReviews: { // Số lượng đánh giá
      type: Number,
      required: true,
      default: 0,
    },
    price: { // Giá bán hiện tại
      type: Number,
      required: true,
      default: 0,
    },
    originalPrice: { // Giá gốc (nếu có khuyến mãi)
      type: Number,
      default: 0,
    },
    countInStock: { // Số lượng tồn kho
      type: Number,
      required: true,
      default: 0,
    },
    attributes: [ // Quản lý thuộc tính động
      {
        name: { type: String, required: true }, // Ví dụ: 'Màu sắc', 'Kích thước'
        value: { type: String, required: true }, // Ví dụ: 'Xanh', '120cm x 60cm'
      }
    ],
    // Có thể thêm các trường quản lý kho nâng cao: provider, sku, lowStockThreshold...
    relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    // SEO Fields
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoKeywords: { type: String }, // Có thể là mảng String
    // Quản lý phiên bản (đơn giản là timestamps, phức tạp hơn cần schema riêng)
    // isFeatured: { type: Boolean, default: false }, // Sản phẩm nổi bật?
    // isOnSale: { type: Boolean, default: false }, // Đang khuyến mãi?
    // saleEndDate: { type: Date } // Ngày kết thúc khuyến mãi
  },
  {
    timestamps: true,
  }
);

// Middleware để tự tạo slug từ name nếu slug chưa được cung cấp
productSchema.pre('validate', function(next) {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');
     // Cần xử lý thêm để đảm bảo slug là unique, ví dụ thêm timestamp hoặc số ngẫu nhiên nếu trùng
  }
  next();
});

const Product = mongoose.model('Product', productSchema);

export default Product;