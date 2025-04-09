import mongoose from 'mongoose';

const cartItemSchema = mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product',
  },
  name: { type: String, required: true }, // Lưu lại tên SP phòng trường hợp SP gốc bị xóa/đổi tên
  image: { type: String, required: true }, // Lưu lại ảnh
  price: { type: Number, required: true }, // Lưu lại giá lúc thêm vào giỏ
  qty: { type: Number, required: true },
  // Thêm các thuộc tính đã chọn (màu, size...) nếu cần
});

const cartSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true, // Mỗi user chỉ có 1 giỏ hàng
    },
    items: [cartItemSchema],
    // Không cần lưu tổng tiền ở đây, tính toán khi lấy giỏ hàng hoặc ở frontend
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model('Cart', cartSchema);

export default Cart;