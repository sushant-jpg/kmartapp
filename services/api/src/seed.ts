import argon2 from "argon2";
import mongoose from "mongoose";
import { z } from "zod";
import { registerSchema } from "@kmart/shared";
import { env } from "./config/env.js";
import { User } from "./modules/auth/models.js";
import { Brand, Category, Product } from "./modules/catalog/models.js";
import { productSchema } from "./modules/catalog/validation.js";

if (env.NODE_ENV !== "development")
  throw new Error("Demo seeding requires NODE_ENV=development");
const credentials = z
  .object({
    SEED_ADMIN_EMAIL: registerSchema.shape.email,
    SEED_ADMIN_PASSWORD: registerSchema.shape.password,
  })
  .parse(process.env);
await mongoose.connect(env.MONGO_URI);
try {
  await Promise.all([
    User.init(),
    Brand.init(),
    Category.init(),
    Product.init(),
  ]);
  await mongoose.connection.transaction(async (session) => {
    const existing = await User.findOne({
      email: credentials.SEED_ADMIN_EMAIL,
    }).session(session);
    if (existing && existing.role !== "admin")
      throw new Error(
        "Seed email belongs to a customer; choose a different email",
      );
    if (!existing)
      await User.create(
        [
          {
            fullName: "Store Administrator",
            username: `admin_${new mongoose.Types.ObjectId().toString().slice(-12)}`,
            email: credentials.SEED_ADMIN_EMAIL,
            role: "admin",
            passwordHash: await argon2.hash(credentials.SEED_ADMIN_PASSWORD, {
              type: argon2.argon2id,
              memoryCost: 65536,
              timeCost: 3,
              parallelism: 1,
            }),
          },
        ],
        { session },
      );
    for (const name of ["Home", "Electronics", "Accessories"]) {
      await Category.updateOne(
        { slug: name.toLowerCase() },
        { $setOnInsert: { name, slug: name.toLowerCase(), active: true } },
        { upsert: true, session },
      );
    }
    await Brand.updateOne(
      { slug: "kmart-demo" },
      {
        $setOnInsert: { name: "KMart Demo", slug: "kmart-demo", active: true },
      },
      { upsert: true, session },
    );
    const examples = [
      {
        name: "Everyday Backpack",
        slug: "demo-backpack",
        sku: "DEMO-BAG-01",
        category: "Accessories",
        regularPrice: 249900,
        tags: ["bag", "travel"],
      },
      {
        name: "Wireless Headphones",
        slug: "demo-headphones",
        sku: "DEMO-AUDIO-01",
        category: "Electronics",
        regularPrice: 499900,
        tags: ["audio", "wireless"],
      },
      {
        name: "Ceramic Coffee Mug",
        slug: "demo-mug",
        sku: "DEMO-HOME-01",
        category: "Home",
        regularPrice: 59900,
        tags: ["coffee", "kitchen"],
      },
    ];
    for (const example of examples) {
      const input = productSchema.parse({
        ...example,
        brand: "KMart Demo",
        stock: 20,
        featured: true,
        newArrival: true,
        thumbnail: `https://placehold.co/600x600/png?text=${encodeURIComponent(example.name)}`,
        description:
          "Development sample product. Replace this listing before launch.",
        shortDescription: "Demo catalog item",
      });
      await Product.updateOne(
        { sku: input.sku },
        { $setOnInsert: input },
        { upsert: true, session, runValidators: true },
      );
    }
  });
  console.info(
    "Development catalog and admin are ready. Existing records were preserved.",
  );
} finally {
  await mongoose.disconnect();
}
