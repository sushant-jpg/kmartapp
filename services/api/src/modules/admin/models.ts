import { Schema,model } from 'mongoose';
export const AuditLog=model('AuditLog',new Schema({adminId:{type:Schema.Types.ObjectId,required:true},action:{type:String,required:true},resource:{type:String,required:true},resourceId:String,previousValue:Schema.Types.Mixed,newValue:Schema.Types.Mixed,requestId:String},{timestamps:true}));
