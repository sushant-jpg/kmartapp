import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { z } from 'zod';
import type { checkoutSchema,OrderStatus } from '@kmart/shared';
import { Cart,Address,Order,Payment,CouponUsage,ReturnRequest } from './models.js';
import { resolveLine,calculateTotals } from './cart-service.js';
import { applyCoupon } from './coupon-service.js';
import { reserve,settleInventory } from './inventory-service.js';
import { requireValue,AppError } from '../../lib/errors.js';
import { hashToken } from '../auth/service.js';
import { Outbox } from '../auth/models.js';
import { enabledProviders } from './payment-service.js';
export async function checkout(userId:string,key:string,input:z.infer<typeof checkoutSchema>){
 const requestHash=hashToken(JSON.stringify(input));
 const existing=await Order.findOne({userId,idempotencyKey:key});
 if(existing){if(existing.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This key was used for a different request');return existing;}
 if(!enabledProviders().includes(input.paymentMethod))throw new AppError(503,'PAYMENT_UNAVAILABLE','This payment provider is not enabled');
 const orderId=new mongoose.Types.ObjectId();
 try{await mongoose.connection.transaction(async session=>{
  const address=requireValue(await Address.findOne({_id:input.addressId,userId}).session(session).lean(),'ADDRESS_NOT_FOUND');
  const cart=requireValue(await Cart.findOne({userId}).session(session),'CART_EMPTY');if(!cart.items.length)throw new AppError(400,'CART_EMPTY','Your cart is empty');
  const items=[];for(const i of cart.items)items.push(await resolveLine({productId:String(i.productId),variantId:i.variantId?String(i.variantId):undefined,quantity:i.quantity},session));
  const {discount,couponId}=await applyCoupon(input.coupon,userId,items,session);
  const totals=calculateTotals(items.reduce((n,i)=>n+i.price*i.quantity,0),discount);
  await reserve(items,String(orderId),session);
  const cod=input.paymentMethod==='cod';
  if(cod)await settleInventory(items,String(orderId),'sell',session);
  const status=cod?'confirmed':'pending_payment';
  await Order.create([{_id:orderId,userId,number:`KM-${randomUUID().slice(0,12).toUpperCase()}`,idempotencyKey:key,requestHash,items,address,...totals,couponId,status,paymentMethod:input.paymentMethod,inventoryState:cod?'sold':'reserved',expiresAt:cod?undefined:new Date(Date.now()+15*60000),history:[{status,at:new Date()}]}],{session});
  await Payment.create([{orderId,provider:input.paymentMethod,amount:totals.total}],{session});
  if(couponId)await CouponUsage.create([{couponId,userId,orderId}],{session});
  await Outbox.create([{kind:'order_notification',key:`${orderId}:${status}`,payload:{orderId,userId,status}}],{session});
  cart.items.splice(0);cart.version+=1;await cart.save({session});
 });}catch(error){const duplicate=await Order.findOne({userId,idempotencyKey:key});if(duplicate&&duplicate.requestHash===requestHash)return duplicate;throw error;}
 return requireValue(await Order.findById(orderId));
}
export const transitions:Partial<Record<OrderStatus,OrderStatus[]>>={confirmed:['processing','cancelled'],payment_confirmed:['processing'],processing:['packed'],packed:['shipped'],shipped:['out_for_delivery'],out_for_delivery:['delivered']};
export async function transitionOrder(orderId:string,next:OrderStatus,actor:{userId:string;admin:boolean},note=''){
 await mongoose.connection.transaction(async session=>{
  const order=requireValue(await Order.findOne({_id:orderId,...(!actor.admin?{userId:actor.userId}:{})}).session(session));
  if(order.status===next)return;
  const customerCancel=!actor.admin&&next==='cancelled'&&['pending_payment','confirmed'].includes(order.status)&&order.paymentMethod==='cod';
  if(!customerCancel&&(!actor.admin||!transitions[order.status as OrderStatus]?.includes(next)))throw new AppError(409,'INVALID_TRANSITION','This order cannot be changed to that status');
  if(next==='cancelled'){
   if(order.paymentMethod!=='cod')throw new AppError(409,'REFUND_REQUIRED','Paid orders require an approved refund workflow');
   await settleInventory(order.items,orderId,order.inventoryState==='reserved'?'release':'return',session);order.inventoryState='released';
  }
  if(next==='delivered'&&order.paymentMethod==='cod')await Payment.updateOne({orderId,status:'pending'},{$set:{status:'paid'}},{session});
  order.status=next;order.history.push({status:next,at:new Date(),note});await order.save({session});
  await Outbox.create([{kind:'order_notification',key:`${orderId}:${next}`,payload:{orderId,userId:order.userId,status:next}}],{session});
 });return Order.findById(orderId);
}
export async function requestReturn(userId:string,orderId:string,reason:string){
 return mongoose.connection.transaction(async session=>{
 const order=requireValue(await Order.findOne({_id:orderId,userId,status:'delivered'}).session(session));
 const delivered=order.history.find(h=>h.status==='delivered');if(!delivered||Date.now()-delivered.at.getTime()>7*86400000)throw new AppError(409,'RETURN_WINDOW_CLOSED','The seven-day return request window has closed');
 const [result]=await ReturnRequest.create([{orderId,userId,reason,history:[{status:'requested',at:new Date()}]}],{session});order.status='return_requested';order.history.push({status:'return_requested',at:new Date()});await order.save({session});return result;
 });
}
export async function expireOrders(){
 const orders=await Order.find({status:'pending_payment',expiresAt:{$lte:new Date()}}).select('_id').limit(100).lean();
 for(const candidate of orders)await mongoose.connection.transaction(async session=>{
  const order=await Order.findOne({_id:candidate._id,status:'pending_payment',inventoryState:'reserved'}).session(session);if(!order)return;
  await settleInventory(order.items,String(order._id),'release',session);order.inventoryState='released';order.status='cancelled';order.history.push({status:'cancelled',at:new Date(),note:'Payment window expired'});await order.save({session});
  await Payment.updateOne({orderId:order._id,status:'pending'},{$set:{status:'failed'}},{session});
 });
}
