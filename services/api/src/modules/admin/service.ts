import mongoose from 'mongoose';
import { Product,InventoryMovement } from '../catalog/models.js';
import { Order,Payment } from '../commerce/models.js';
import { User } from '../auth/models.js';
import { AnalyticsEvent } from '../engagement/models.js';
import { Conversation } from '../ai/models.js';
import { AuditLog } from './models.js';
import { requireValue,AppError } from '../../lib/errors.js';
export async function adjustInventory(adminId:string,productId:string,quantity:number,reason:string){
 return mongoose.connection.transaction(async session=>{
  const product=requireValue(await Product.findById(productId).session(session));
  if(product.hasVariants)throw new AppError(409,'VARIANT_INVENTORY','Update individual variant inventory');
  if(product.stock+quantity<product.reservedStock)throw new AppError(409,'RESERVED_STOCK','Adjustment would consume reserved stock');
  const previous=product.stock;product.stock+=quantity;await product.save({session});
  await InventoryMovement.create([{productId,kind:'adjust',quantity,reason,actorId:adminId,key:String(new mongoose.Types.ObjectId())}],{session});
  await AuditLog.create([{adminId,action:'inventory.adjust',resource:'Product',resourceId:productId,previousValue:{stock:previous},newValue:{stock:product.stock,reason}}],{session});return product;
 });
}
export async function metrics(from:Date,to:Date){
 const date={createdAt:{$gte:from,$lte:to}};
 const [sales,paid,customers,events,lowStock,bestSellers,conversations]=await Promise.all([
  Order.aggregate([{$match:{...date,status:{$nin:['cancelled','pending_payment']}}},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt'}},revenue:{$sum:'$total'},orders:{$sum:1},discounts:{$sum:'$discount'}}},{$sort:{_id:1}}]),
  Payment.aggregate([{$match:{...date,status:'paid'}},{$group:{_id:null,total:{$sum:'$amount'},count:{$sum:1}}}]),
  User.countDocuments({...date,role:'customer'}),AnalyticsEvent.aggregate([{$match:date},{$group:{_id:'$name',count:{$sum:1}}}]),
  Product.find({active:true,$expr:{$lte:[{$subtract:['$stock','$reservedStock']},'$lowStockThreshold']}}).select('name stock reservedStock').limit(20).lean(),
  Product.find({active:true}).sort({soldCount:-1}).select('name soldCount').limit(5).lean(),Conversation.countDocuments(date)
 ]);
 const orders=sales.reduce((s,r)=>s+Number(r.orders),0);const grossRevenue=sales.reduce((s,r)=>s+Number(r.revenue),0);
 return {grossRevenue,collectedRevenue:Number(paid[0]?.total??0),orders,averageOrderValue:orders?Math.round(grossRevenue/orders):0,customers,events,lowStock,bestSellers,conversations,sales};
}
