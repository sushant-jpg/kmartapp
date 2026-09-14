import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { AppError,requireValue } from '../../lib/errors.js';
import { Order,Payment,PaymentEvent } from './models.js';
import { settleInventory } from './inventory-service.js';
import { Outbox } from '../auth/models.js';
export interface PaymentProvider {name:string;initiate(order:{id:string;amount:number;currency:string}):Promise<{providerId:string;clientSecret?:string;redirectUrl?:string}>;verify(payload:Buffer,signature:string):Promise<{eventId:string;providerId:string;amount:number;currency:string;paid:boolean}>}
const providers=new Map<string,PaymentProvider>();
export function registerPaymentProvider(provider:PaymentProvider){providers.set(provider.name,provider);}
export function enabledProviders(){return ['cod',...providers.keys()];}
export async function initiatePayment(userId:string,orderId:string){
 const order=requireValue(await Order.findOne({_id:orderId,userId}));
 if(order.status!=='pending_payment'||!order.expiresAt||order.expiresAt.getTime()<=Date.now())throw new AppError(409,'PAYMENT_CLOSED','Order is not accepting payment');
 const provider=providers.get(order.paymentMethod);if(!provider)throw new AppError(503,'PAYMENT_UNAVAILABLE','Payment provider is unavailable');
 const result=await provider.initiate({id:orderId,amount:order.total,currency:'NPR'});
 await Payment.updateOne({orderId,status:'pending'},{$set:{providerId:result.providerId}});return result;
}
export async function handlePaymentEvent(providerName:string,raw:Buffer,signature:string){
 const provider=providers.get(providerName);if(!provider)throw new AppError(404,'PROVIDER_NOT_FOUND','Payment provider not found');
 const event=await provider.verify(raw,signature);
 if(!event.paid)return;
 await mongoose.connection.transaction(async session=>{
  if(await PaymentEvent.exists({eventId:event.eventId}).session(session))return;
  const payment=requireValue(await Payment.findOne({provider:providerName,providerId:event.providerId}).session(session));
  const order=requireValue(await Order.findById(payment.orderId).session(session));
  if(event.amount!==payment.amount||event.currency.toUpperCase()!==payment.currency)throw new AppError(400,'PAYMENT_MISMATCH','Payment does not match the order');
  await PaymentEvent.create([{eventId:event.eventId,provider:providerName,orderId:order._id}],{session});
  if(payment.status==='paid')return;
  if(order.inventoryState!=='reserved'||order.status!=='pending_payment'){
   payment.status='paid';order.status='refund_pending';order.history.push({status:'refund_pending',at:new Date(),note:'Payment arrived after order closure; manual refund required'});
  }else{await settleInventory(order.items,String(order._id),'sell',session);order.inventoryState='sold';order.status='payment_confirmed';payment.status='paid';order.history.push({status:'payment_confirmed',at:new Date()});}
  await payment.save({session});await order.save({session});
  await Outbox.create([{kind:'order_notification',key:`${order._id}:${order.status}`,payload:{userId:order.userId,orderId:order._id,status:order.status}}],{session});
 });
}
// Keys alone do not enable providers. Register an adapter only after merchant
// currency, webhook verification and reconciliation have been configured.
export const paymentConfiguration={stripeConfigured:Boolean(env.STRIPE_SECRET_KEY)};
