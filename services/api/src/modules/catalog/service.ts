import type { FilterQuery } from 'mongoose';
import type { z } from 'zod';
import { Product,ProductVariant } from './models.js';
import { productQuery } from './validation.js';
import { requireValue } from '../../lib/errors.js';
import { redis } from '../../lib/db.js';
export const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function effectivePrice(product:{regularPrice:number;salePrice?:number|null}){return product.salePrice??product.regularPrice;}
export async function listProducts(input:z.infer<typeof productQuery>){
 const filter:FilterQuery<typeof Product>={active:true};
 if(input.q)filter.$or=['name','brand','category','tags','sku'].map(field=>({[field]:{$regex:escapeRegex(input.q!),$options:'i'}}));
 if(input.category)filter.category=input.category;if(input.brand)filter.brand=input.brand;
 if(input.minPrice!==undefined||input.maxPrice!==undefined)filter.$expr={$and:[{$gte:[{$ifNull:['$salePrice','$regularPrice']},input.minPrice??0]},{$lte:[{$ifNull:['$salePrice','$regularPrice']},input.maxPrice??Number.MAX_SAFE_INTEGER]}]};
 if(input.cursor)filter._id=input.sort==='newest'?{$lt:input.cursor}:{$gt:input.cursor};
 const rows=await Product.find(filter).select('-costPrice').sort({_id:input.sort==='newest'?-1:1}).limit(input.limit+1).lean();
 const more=rows.length>input.limit;if(more)rows.pop();return {data:rows,meta:{nextCursor:more?String(rows.at(-1)!._id):null}};
}
export async function getProduct(id:string){
 const product=requireValue(await Product.findOne({_id:id,active:true}).lean(),'PRODUCT_NOT_FOUND');
 const variants=await ProductVariant.find({productId:product._id,active:true}).lean();return {...product,variants};
}
export async function autocomplete(q:string){
 const key=`autocomplete:${q.toLowerCase()}`;try{const cached=await redis.get(key);if(cached)return JSON.parse(cached) as {name:string;_id:string}[];}catch{/* authoritative fallback */}
 const rows=await Product.find({active:true,name:{$regex:`^${escapeRegex(q)}`,$options:'i'}}).select('name').limit(8).lean();
 try{await redis.set(key,JSON.stringify(rows),'EX',30);}catch{/* cache is expendable */}return rows;
}
