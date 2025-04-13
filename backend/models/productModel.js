// backend/models/productModel.js
import mongoose from 'mongoose';

const reviewSchema = mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
        name: { type: String, required: true },
        rating: { type: Number, required: true },
        comment: { type: String, required: true },
    },
    { timestamps: true }
);

const productSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        image: { type: String, required: true },
        images: [{ type: String }],
        videos: [{ type: String }],
        brand: { type: String },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Category',
        },
        description: { type: String, required: true },
        detailedDescription: { type: String },
        reviews: [reviewSchema],
        rating: {
            type: Number,
            required: true,
            default: 0,
        },
        numReviews: {
            type: Number,
            required: true,
            default: 0,
        },
        price: {
            type: Number,
            required: true,
            default: 0,
        },
        originalPrice: {
            type: Number,
            default: 0,
        },
        countInStock: {
            type: Number,
            required: true,
            default: 0,
        },
        attributes: [
            {
                name: { type: String, required: true },
                value: { type: String, required: true },
            },
        ],
        relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        seoTitle: { type: String },
        seoDescription: { type: String },
        seoKeywords: { type: String },
        isFlashSale: {
            type: Boolean,
            default: false,
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        saleStartDate: {
            type: Date,
            default: null,
        },
        saleEndDate: {
            type: Date,
            default: null,
        },
        totalFlashSaleSlots: {
            type: Number,
            default: 0,
        },
        remainingFlashSaleSlots: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['còn hàng', 'hết hàng', 'đang ẩn'],
            default: 'còn hàng',
        },
    },
    {
        timestamps: true,
    }
);

// Middleware to auto-generate slug from name if not provided
productSchema.pre('validate', function (next) {
    if (this.name && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/ /g, '-')
            .replace(/[^\w-]+/g, '');
    }
    next();
});

const Product = mongoose.model('Product', productSchema);

export default Product;