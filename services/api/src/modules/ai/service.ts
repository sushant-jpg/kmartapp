import mongoose from 'mongoose';
import { z } from 'zod';
import { Conversation,ChatMessage } from './models.js';
import { extractIntent,type Requirements } from './intent-service.js';
import { retrieveProducts } from './product-retrieval-service.js';
import { CatalogOnlyProvider,SYSTEM_PROMPT,type AIProvider } from './prompt-service.js';
import { Product } from '../catalog/models.js';
import { Order } from '../commerce/models.js';
import { requireValue,AppError } from '../../lib/errors.js';
let provider:AIProvider=new CatalogOnlyProvider();
export function configureAIProvider(value:AIProvider){provider=value;}
export async function chat(userId:string,message:string,conversationId?:string){
 const conversation=conversationId?requireValue(await Conversation.findOne({_id:conversationId,userId,expiresAt:{$gt:new Date()}}),'CONVERSATION_NOT_FOUND'):await Conversation.create({userId,expiresAt:new Date(Date.now()+86400000)});
 const brands=await Product.distinct('brand',{active:true});const categories=await Product.distinct('category',{active:true});
 const {intent,filters}=extractIntent(message,conversation.state as Requirements,brands,categories);
 let answer='';let products:Awaited<ReturnType<typeof retrieveProducts>>=[];let orders:unknown[]=[];
 const suggestedReplies:string[]=[];
 if(intent==='order_support'){
  const supplied=message.match(/\b[a-f\d]{24}\b/i)?.[0];
  const owned=await Order.find({userId,...(supplied?{_id:supplied}:{})}).select('number status history total createdAt').sort({_id:-1}).limit(3).lean();orders=owned;
  answer=owned.length?'Here are the latest recorded updates for your orders. Delivery estimates are unavailable unless confirmed by the carrier.':'No matching orders were found in your account.';
  if(/cancel|refund/.test(message.toLowerCase()))answer+=' Open the order details to review eligibility and explicitly confirm any request. I have not changed your order.';
 }else if(intent==='return_policy')answer='You can request a return from a delivered order within seven days. Include the reason, such as a wrong or damaged item. Approval and refund depend on review; no return has been submitted.';
 else if(intent==='account_support')answer='Manage your saved addresses in Account. For an existing order, contact support before dispatch. I have not changed your account or delivery address.';
 else{
  const mentioned=message.match(/\b[a-f\d]{24}\b/gi);
  const ids=intent==='comparison'?(mentioned??conversation.lastProductIds.slice(0,2).map(String)):undefined;
  products=await retrieveProducts(filters,message,ids);
  if(products.length){
   try{const ranked=z.object({productIds:z.array(z.string()).max(6)}).parse(await provider.rank({system:SYSTEM_PROMPT,message,products:products.map(p=>({id:String(p._id),name:p.name,tags:p.tags}))}));
    const byId=new Map(products.map(p=>[String(p._id),p]));const unique=[...new Set(ranked.productIds)];const safe=unique.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);if(safe.length)products=safe;
   }catch{/* deterministic ranking remains available when model calls fail */}
   answer=intent==='comparison'?'Compare the current catalog facts below. Unlisted specifications are unavailable.':`I found ${products.length} available ${products.length===1?'product':'products'} matching your filters.`;
   suggestedReplies.push('Show cheaper options','Compare the first two');
  }else{answer='No available products match these requirements. Would you like to change your budget or brand?';suggestedReplies.push('Show all brands');}
 }
 const updated=await Conversation.updateOne({_id:conversation._id,userId,version:conversation.version},{$set:{state:filters,lastProductIds:products.map(p=>p._id),expiresAt:new Date(Date.now()+86400000)},$inc:{version:1}});
 if(!updated.modifiedCount)throw new AppError(409,'CONVERSATION_BUSY','Please wait for the previous reply and try again');
 await ChatMessage.insertMany([{conversationId:conversation._id,role:'user',content:message,expiresAt:new Date(Date.now()+7*86400000)},{conversationId:conversation._id,role:'assistant',content:answer,productIds:products.map(p=>p._id),expiresAt:new Date(Date.now()+7*86400000)}]);
 const comparison=intent==='comparison'?products.map(p=>({id:p._id,name:p.name,price:p.salePrice??p.regularPrice,specifications:p.specifications,rating:p.averageRating,availableStock:p.stock-p.reservedStock})):undefined;
 return {conversationId:String(conversation._id),answer,intent,products,filters,suggestedReplies,orders,comparison};
}
export async function forgetConversations(userId:string){const ids=await Conversation.find({userId}).distinct('_id');await mongoose.connection.transaction(async session=>{await ChatMessage.deleteMany({conversationId:{$in:ids}},{session});await Conversation.deleteMany({userId},{session});});}
