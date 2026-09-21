import { Product } from '../models/product.model';

// Snapshot consultado en DummyJSON el 11 de septiembre de 2026.
// Semilla inicial de SQLite y copia de lectura cuando falla la conexión o hay 5xx.
export const MOCK_PRODUCTS: Product[] = [
  {
    "id": 1,
    "title": "Essence Mascara Lash Princess",
    "description": "The Essence Mascara Lash Princess is a popular mascara known for its volumizing and lengthening effects. Achieve dramatic lashes with this long-lasting and cruelty-free formula.",
    "category": "beauty",
    "price": 9.99,
    "discountPercentage": 10.48,
    "rating": 2.56,
    "stock": 99,
    "brand": "Essence",
    "thumbnail": "assets/products/1.webp",
    "images": [
      "assets/products/1.webp"
    ]
  },
  {
    "id": 2,
    "title": "Eyeshadow Palette with Mirror",
    "description": "The Eyeshadow Palette with Mirror offers a versatile range of eyeshadow shades for creating stunning eye looks. With a built-in mirror, it's convenient for on-the-go makeup application.",
    "category": "beauty",
    "price": 19.99,
    "discountPercentage": 18.19,
    "rating": 2.86,
    "stock": 34,
    "brand": "Glamour Beauty",
    "thumbnail": "assets/products/2.webp",
    "images": [
      "assets/products/2.webp"
    ]
  },
  {
    "id": 3,
    "title": "Powder Canister",
    "description": "The Powder Canister is a finely milled setting powder designed to set makeup and control shine. With a lightweight and translucent formula, it provides a smooth and matte finish.",
    "category": "beauty",
    "price": 14.99,
    "discountPercentage": 9.84,
    "rating": 4.64,
    "stock": 89,
    "brand": "Velvet Touch",
    "thumbnail": "assets/products/3.webp",
    "images": [
      "assets/products/3.webp"
    ]
  },
  {
    "id": 4,
    "title": "Red Lipstick",
    "description": "The Red Lipstick is a classic and bold choice for adding a pop of color to your lips. With a creamy and pigmented formula, it provides a vibrant and long-lasting finish.",
    "category": "beauty",
    "price": 12.99,
    "discountPercentage": 12.16,
    "rating": 4.36,
    "stock": 91,
    "brand": "Chic Cosmetics",
    "thumbnail": "assets/products/4.webp",
    "images": [
      "assets/products/4.webp"
    ]
  },
  {
    "id": 5,
    "title": "Red Nail Polish",
    "description": "The Red Nail Polish offers a rich and glossy red hue for vibrant and polished nails. With a quick-drying formula, it provides a salon-quality finish at home.",
    "category": "beauty",
    "price": 8.99,
    "discountPercentage": 11.44,
    "rating": 4.32,
    "stock": 79,
    "brand": "Nail Couture",
    "thumbnail": "assets/products/5.webp",
    "images": [
      "assets/products/5.webp"
    ]
  },
  {
    "id": 6,
    "title": "Calvin Klein CK One",
    "description": "CK One by Calvin Klein is a classic unisex fragrance, known for its fresh and clean scent. It's a versatile fragrance suitable for everyday wear.",
    "category": "fragrances",
    "price": 49.99,
    "discountPercentage": 1.89,
    "rating": 4.37,
    "stock": 29,
    "brand": "Calvin Klein",
    "thumbnail": "assets/products/6.webp",
    "images": [
      "assets/products/6.webp"
    ]
  }
];

