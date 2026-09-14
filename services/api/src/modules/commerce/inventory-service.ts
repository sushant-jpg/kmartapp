import type { ClientSession } from 'mongoose';
import { Product,ProductVariant,InventoryMovement } from '../catalog/models.js';
import { AppError } from '../../lib/errors.js';
type Line={productId:unknown;variantId?:unknown;quantity:number};
export async function reserve(items:Line[],orderId:string,session:ClientSession){
 for(const item of items){
  const filter={_id:item.variantId??item.productId,active:true,$expr:{$gte:[{$subtract:['$stock','$reservedStock']},item.quantity]}};
  const update={$inc:{reservedStock:item.quantity}};
  const result=item.variantId?await ProductVariant.updateOne(filter,update,{session}):await Product.updateOne(filter,update,{session});
  if(result.modifiedCount!==1)throw new AppError(409,'INSUFFICIENT_STOCK','An item no longer has enough stock');
  await InventoryMovement.create([{productId:item.productId,variantId:item.variantId,quantity:item.quantity,orderId,kind:'reserve',key:`${orderId}:reserve:${item.variantId??item.productId}`}],{session});
 }
}
export async function settleInventory(items:Line[],orderId:string,action:'sell'|'release'|'return',session:ClientSession){
 for(const item of items){
  const delta=action==='sell'?{stock:-item.quantity,reservedStock:-item.quantity}:action==='release'?{reservedStock:-item.quantity}:{stock:item.quantity};
  const filter={_id:item.variantId??item.productId,...(action!=='return'?{reservedStock:{$gte:item.quantity}}:{})};
  const result=item.variantId?await ProductVariant.updateOne(filter,{$inc:delta},{session}):await Product.updateOne(filter,{$inc:delta},{session});
  if(result.modifiedCount!==1)throw new AppError(409,'INVENTORY_CONFLICT','Inventory requires reconciliation');
  if(action==='sell')await Product.updateOne({_id:item.productId},{$inc:{soldCount:item.quantity}},{session});
  if(action==='return')await Product.updateOne({_id:item.productId,soldCount:{$gte:item.quantity}},{$inc:{soldCount:-item.quantity}},{session});
  await InventoryMovement.create([{productId:item.productId,variantId:item.variantId,quantity:item.quantity,orderId,kind:action,key:`${orderId}:${action}:${item.variantId??item.productId}`}],{session});
 }
}
