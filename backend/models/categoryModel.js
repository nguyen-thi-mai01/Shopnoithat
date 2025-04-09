import mongoose from 'mongoose';

const categorySchema = mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true }, // For URL friendly paths
    description: { type: String },
    image: { type: String }, // Path to the image
    parent: { // For subcategories
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    // Thêm các trường SEO nếu cần
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoKeywords: { type: String },
  },
  {
    timestamps: true,
  }
);

// Middleware để tự tạo slug từ name nếu slug chưa được cung cấp
categorySchema.pre('validate', function(next) {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/ /g, '-') // Thay khoảng trắng bằng gạch ngang
      .replace(/[^\w-]+/g, ''); // Xóa các ký tự không hợp lệ
  }
  next();
});


const Category = mongoose.model('Category', categorySchema);

export default Category;