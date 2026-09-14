import mongoose from 'mongoose';
import { Product } from '../catalog/models.js';
import { Order,Wishlist } from '../commerce/models.js';
import { Review,AnalyticsEvent,SearchEvent,ProductView } from './models.js';
import { requireValue } from '../../lib/errors.js';
export async function createReview(userId:string,productId:string,input:{rating:number;text:string;images:string[]}){
 return mongoose.connection.transaction(async session=>{
  requireValue(await Product.exists({_id:productId,active:true}).session(session));
  const verified=Boolean(await Order.exists({userId,status:{$in:['delivered','return_requested']},'items.productId':productId}).session(session));
  const [review]=await Review.create([{...input,userId,productId,verifiedPurchase:verified}],{session});
  const stats=await Review.aggregate< {average:number;count:number}>([{$match:{productId:new mongoose.Types.ObjectId(productId),status:'published'}},{$group:{_id:null,average:{$avg:'$rating'},count:{$sum:1}}}]).session(session);
  await Product.updateOne({_id:productId},{$set:{averageRating:stats[0]?.average??0,reviewCount:stats[0]?.count??0}},{session});return review;
 });
}
export async function recordEvent(userId:string,input:{name:string;productId?:string;query?:string;source?:string}){
 const expiresAt=new Date(Date.now()+90*86400000);await AnalyticsEvent.create({...input,userId,expiresAt});
 if(input.name==='search'&&input.query)await SearchEvent.create({userId,query:input.query,expiresAt});
 if(input.name==='product_view'&&input.productId){await ProductView.create({userId,productId:input.productId,expiresAt});await Product.updateOne({_id:input.productId},{$inc:{viewCount:1}});}
}
export async function recommendations(userId:string,kind:string,productId?:string){
 const recent=await ProductView.find({userId}).sort({_id:-1}).limit(30).lean();
 if(kind==='recent')return Product.find({_id:{$in:recent.map(v=>v.productId)},active:true}).limit(12).lean();
 if(kind==='similar'&&productId){const p=requireValue(await Product.findOne({_id:productId,active:true}));return Product.find({_id:{$ne:p._id},category:p.category,active:true,$expr:{$gt:['$stock','$reservedStock']}}).sort({averageRating:-1}).limit(12).lean();}
 if(kind==='bought-together'&&productId){const related=await Order.aggregate<{_id:mongoose.Types.ObjectId;count:number}>([{$match:{status:'delivered','items.productId':new mongoose.Types.ObjectId(productId)}},{$unwind:'$items'},{$match:{'items.productId':{$ne:new mongoose.Types.ObjectId(productId)}}},{$group:{_id:'$items.productId',count:{$sum:1}}},{$sort:{count:-1}},{$limit:12}]);return Product.find({_id:{$in:related.map(p=>p._id)},active:true}).lean();}
 const wishlist=await Wishlist.findOne({userId});const sources=await Product.find({_id:{$in:[...recent.map(v=>v.productId),...(wishlist?.productIds??[])]}}).select('category').limit(50).lean();
 return Product.find({active:true,...(sources.length?{category:{$in:[...new Set(sources.map(p=>p.category))]}}:{}),$expr:{$gt:['$stock','$reservedStock']}}).sort({soldCount:-1,averageRating:-1}).limit(12).lean();
}
