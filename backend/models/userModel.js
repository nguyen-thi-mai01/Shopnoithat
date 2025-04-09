import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isAdmin: { // Thay vì role, dùng isAdmin đơn giản hơn cho ví dụ này
      type: Boolean,
      required: true,
      default: false,
    },
    // Thêm các trường thông tin cá nhân khác nếu cần
  },
  {
    timestamps: true, // Tự động thêm createdAt và updatedAt
  }
);

// Method để so sánh mật khẩu nhập vào với mật khẩu đã hash
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Middleware: Hash mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  // Chỉ hash nếu mật khẩu được thay đổi (hoặc là mới)
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

export default User;