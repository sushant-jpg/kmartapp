import mongoose from 'mongoose';
import type { z } from 'zod';
import type { cartItemSchema } from '@kmart/shared';
import { Product,ProductVariant } from '../catalog/models.js';
import { effectivePrice } from '../catalog/service.js';
import { Cart } from './models.js';
import { AppError,requireValue } from '../../lib/errors.js';
import { env } from '../../config/env.js';
export type CartInput=z.infer<typeof cartItemSchema>;
export async function resolveLine(item:CartInput,session?:mongoose.ClientSession){
 const product=requireValue(await Product.findOne({_id:item.productId,active:true}).session(session??null).lean(),'PRODUCT_NOT_FOUND');
 const variant=item.variantId?requireValue(await ProductVariant.findOne({_id:item.variantId,productId:product._id,active:true}).session(session??null).lean(),'VARIANT_NOT_FOUND'):undefined;
 if(product.hasVariants&&!variant)throw new AppError(400,'VARIANT_REQUIRED','Select a product variant');
 const inventory=variant??product;return {...item,name:variant?`${product.name} · ${variant.name}`:product.name,sku:variant?.sku??product.sku,thumbnail:variant?.images[0]??product.thumbnail,price:variant?.price??effectivePrice(product),available:inventory.stock-inventory.reservedStock,category:product.category};
}
export function calculateTotals(subtotal:number,discount=0){const shipping=subtotal===0?0:env.SHIPPING_MINOR;const tax=Math.round((subtotal-discount)*env.TAX_BPS/10000);return {subtotal,discount,shipping,tax,total:subtotal-discount+shipping+tax};}
export async function getCart(userId:string){const cart=await Cart.findOne({userId}).lean();const items=[];for(const i of cart?.items??[])items.push(await resolveLine({productId:String(i.productId),variantId:i.variantId?String(i.variantId):undefined,quantity:i.quantity}));return {items,...calculateTotals(items.reduce((sum,i)=>sum+i.price*i.quantity,0))};}
export async function setCart(userId:string,items:CartInput[],merge=false){
 await mongoose.connection.transaction(async session=>{
  const cart=await Cart.findOneAndUpdate({userId},{$setOnInsert:{items:[]}},{upsert:true,new:true,session});
  const combined=new Map<string,CartInput>();
  if(merge)for(const i of cart.items){const item={productId:String(i.productId),variantId:i.variantId?String(i.variantId):undefined,quantity:i.quantity};combined.set(`${item.productId}:${item.variantId??''}`,item);}
  for(const item of items){const key=`${item.productId}:${item.variantId??''}`;const old=combined.get(key);combined.set(key,{...item,quantity:Math.min(20,item.quantity+(merge?(old?.quantity??0):0))});}
  if(combined.size>50)throw new AppError(400,'CART_LIMIT','Cart supports up to 50 items');
  const valid=[];for(const item of combined.values()){const line=await resolveLine(item,session);if(line.available<item.quantity){if(!merge)throw new AppError(409,'INSUFFICIENT_STOCK',`${line.name} has insufficient stock`);item.quantity=Math.max(0,Math.min(item.quantity,line.available));}if(item.quantity)valid.push(item);}
  cart.set('items',valid);cart.version+=1;await cart.save({session});
 });return getCart(userId);
}
