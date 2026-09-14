import { it,expect } from 'vitest';
import mongoose from 'mongoose';
import { useDatabase } from './database.js';
import { Product,InventoryMovement } from '../src/modules/catalog/models.js';
import { Cart,Address,Order,Payment,PaymentEvent,Coupon,CouponUsage } from '../src/modules/commerce/models.js';
import { setCart,getCart } from '../src/modules/commerce/cart-service.js';
import { checkout,transitionOrder,expireOrders } from '../src/modules/commerce/order-service.js';
import { registerPaymentProvider,handlePaymentEvent } from '../src/modules/commerce/payment-service.js';
import { Outbox } from '../src/modules/auth/models.js';
useDatabase();
const id=()=>String(new mongoose.Types.ObjectId());
async function fixture(stock=2){const userId=id();const p=await Product.create({name:'Laptop',slug:id(),sku:id(),brand:'ASUS',category:'Laptop',regularPrice:100000,stock,thumbnail:'https://example.com/a.jpg'});const address=await Address.create({userId,recipient:'Customer',phone:'9800000000',province:'Bagmati',city:'Kathmandu',street:'Test street'});await setCart(userId,[{productId:String(p._id),quantity:1}]);return {userId,p,addressId:String(address._id)};}
it('prevents duplicate orders under parallel retries and uses authoritative prices',async()=>{
 await Promise.all([Product.init(),Cart.init(),Address.init(),Order.init(),Payment.init(),PaymentEvent.init(),InventoryMovement.init(),Coupon.init(),CouponUsage.init(),Outbox.init()]);
 const f=await fixture();const input={addressId:f.addressId,paymentMethod:'cod' as const};const orders=await Promise.all([checkout(f.userId,'same-idempotency-key',input),checkout(f.userId,'same-idempotency-key',input)]);
 expect(String(orders[0]._id)).toBe(String(orders[1]._id));expect(orders[0].subtotal).toBe(100000);expect((await Product.findById(f.p._id))!.stock).toBe(1);expect((await getCart(f.userId)).items).toHaveLength(0);
 await expect(checkout(f.userId,'same-idempotency-key',{...input,addressId:id()})).rejects.toThrow('different request');
 await expect(transitionOrder(String(orders[0]._id),'cancelled',{userId:id(),admin:false})).rejects.toThrow();
 await transitionOrder(String(orders[0]._id),'cancelled',{userId:f.userId,admin:false});await transitionOrder(String(orders[0]._id),'cancelled',{userId:f.userId,admin:false});expect((await Product.findById(f.p._id))!.stock).toBe(2);
});
it('cannot oversell the last item across customers',async()=>{
 const a=await fixture(1);const b=id();const address=await Address.create({userId:b,recipient:'Second',phone:'9800000001',province:'Bagmati',city:'Kathmandu',street:'Other street'});await setCart(b,[{productId:String(a.p._id),quantity:1}]);
 const results=await Promise.allSettled([checkout(a.userId,'first-customer-key',{addressId:a.addressId,paymentMethod:'cod'}),checkout(b,'second-customer-key',{addressId:String(address._id),paymentMethod:'cod'})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const p=await Product.findById(a.p._id);expect(p!.stock).toBe(0);expect(p!.reservedStock).toBe(0);
});
it('enforces coupon usage limits transactionally',async()=>{
 const a=await fixture();await Coupon.create({code:'ONLYONE',kind:'percentage',value:1000,usageLimit:1,perCustomer:1,startsAt:new Date(Date.now()-1000),expiresAt:new Date(Date.now()+60000)});
 const order=await checkout(a.userId,'coupon-first-order',{addressId:a.addressId,paymentMethod:'cod',coupon:'ONLYONE'});expect(order.discount).toBe(10000);
 const b=await fixture();await expect(checkout(b.userId,'coupon-second-order',{addressId:b.addressId,paymentMethod:'cod',coupon:'ONLYONE'})).rejects.toThrow('not eligible');expect((await Product.findById(b.p._id))!.stock).toBe(2);
});
it('settles verified payments once and releases expired reservations',async()=>{
 // Test-only adapter exercises business logic; never loaded by the application.
 registerPaymentProvider({name:'stripe',async initiate(){return {providerId:'test'};},async verify(raw,signature){if(signature!=='test-signature')throw new Error('Invalid signature');return JSON.parse(raw.toString()) as {eventId:string;providerId:string;amount:number;currency:string;paid:boolean};}});
 const a=await fixture();const order=await checkout(a.userId,'online-payment-key',{addressId:a.addressId,paymentMethod:'stripe'});await Payment.updateOne({orderId:order._id},{$set:{providerId:'verified-payment'}});
 const event=Buffer.from(JSON.stringify({eventId:'evt-1',providerId:'verified-payment',amount:order.total,currency:'NPR',paid:true}));
 await handlePaymentEvent('stripe',event,'test-signature');await handlePaymentEvent('stripe',event,'test-signature');expect((await Product.findById(a.p._id))!.stock).toBe(1);expect(await PaymentEvent.countDocuments({eventId:'evt-1'})).toBe(1);
 const b=await fixture();const expired=await checkout(b.userId,'expired-payment-key',{addressId:b.addressId,paymentMethod:'stripe'});await Order.updateOne({_id:expired._id},{$set:{expiresAt:new Date(0)}});await expireOrders();await expireOrders();expect((await Product.findById(b.p._id))!.reservedStock).toBe(0);expect((await Product.findById(b.p._id))!.stock).toBe(2);
});
