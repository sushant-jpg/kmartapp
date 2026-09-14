import type { ClientSession } from 'mongoose';
import { Coupon,CouponUsage,Order } from './models.js';
import { AppError } from '../../lib/errors.js';
export async function applyCoupon(code:string|undefined,userId:string,items:{productId:string;category:string;price:number;quantity:number}[],session:ClientSession){
 if(!code)return {discount:0};const coupon=await Coupon.findOne({code,active:true,startsAt:{$lte:new Date()},expiresAt:{$gt:new Date()}}).session(session);
 const invalid=()=>new AppError(400,'INVALID_COUPON','Coupon is not eligible for this order');
 if(!coupon)throw invalid();const subtotal=items.reduce((n,i)=>n+i.price*i.quantity,0);
 if(subtotal<coupon.minimum||coupon.usedCount>=coupon.usageLimit||(coupon.userIds.length&&!coupon.userIds.some(id=>String(id)===userId)))throw invalid();
 if(await CouponUsage.countDocuments({couponId:coupon._id,userId}).session(session)>=coupon.perCustomer)throw invalid();
 if(coupon.firstOrder&&await Order.exists({userId,status:{$nin:['cancelled']}}).session(session))throw invalid();
 const eligible=items.filter(i=>(!coupon.categories.length||coupon.categories.includes(i.category))&&(!coupon.productIds.length||coupon.productIds.some(id=>String(id)===i.productId))).reduce((n,i)=>n+i.price*i.quantity,0);
 if(!eligible)throw invalid();
 const discount=Math.min(eligible,coupon.maximumDiscount??eligible,coupon.kind==='fixed'?coupon.value:Math.floor(eligible*coupon.value/10000));
 const claimed=await Coupon.updateOne({_id:coupon._id,usedCount:{$lt:coupon.usageLimit}},{$inc:{usedCount:1}},{session});if(!claimed.modifiedCount)throw invalid();return {discount,couponId:coupon._id};
}
