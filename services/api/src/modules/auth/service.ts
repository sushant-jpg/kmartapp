import { randomBytes,randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { SignJWT } from 'jose';
import type { z } from 'zod';
import type { registerSchema,loginSchema } from '@kmart/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { User,UserSession,PasswordReset,Outbox } from './models.js';
export const hashToken=(value:string)=>createHash('sha256').update(value).digest('hex');
const denied=()=>new AppError(401,'INVALID_CREDENTIALS','Invalid credentials or expired session');
const options={type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1};
let dummyHash:Promise<string>|undefined;
async function issue(user:{_id:mongoose.Types.ObjectId;role:string|null|undefined;fullName:string},familyId:string=randomUUID(),session?:mongoose.ClientSession,device?:string){
 const secret=randomBytes(48).toString('base64url');
 const [record]=await UserSession.create([{userId:user._id,familyId,tokenHash:hashToken(secret),expiresAt:new Date(Date.now()+30*86400000),device}],{session});
 const accessToken=await new SignJWT({role:user.role,sid:familyId}).setProtectedHeader({alg:'HS256'}).setSubject(String(user._id)).setIssuer('kmart-api').setAudience('kmart-client').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(env.JWT_SECRET));
 return {accessToken,refreshToken:`${record._id}.${secret}`,user:{id:String(user._id),fullName:user.fullName,role:user.role??'customer'}};
}
export async function register(input:z.infer<typeof registerSchema>,device?:string){const {password,...details}=input;const user=await User.create({...details,passwordHash:await argon2.hash(password,options)});return issue(user,undefined,undefined,device);}
export async function login(input:z.infer<typeof loginSchema>,device?:string){
 const user=await User.findOne({$or:[{email:input.identifier},{username:input.identifier}]}).select('+passwordHash');
 dummyHash??=argon2.hash(randomBytes(32).toString('hex'),options);
 const valid=await argon2.verify(user?.passwordHash??await dummyHash,input.password);
 if(!user||!valid||user.status!=='active')throw denied();return issue(user,undefined,undefined,device);
}
export async function refresh(token:string){
 const [id,secret]=token.split('.');if(!/^[a-f\d]{24}$/.test(id??'')||!secret)throw denied();
 const previous=await UserSession.findById(id).select('+tokenHash');
 if(!previous||!timingSafeEqual(Buffer.from(previous.tokenHash),Buffer.from(hashToken(secret))))throw denied();
 if(previous.usedAt||previous.revokedAt){await UserSession.updateMany({familyId:previous.familyId},{$set:{revokedAt:new Date()}});throw denied();}
 if(previous.expiresAt.getTime()<Date.now())throw denied();
 let result:Awaited<ReturnType<typeof issue>>|undefined;
 await mongoose.connection.transaction(async session=>{
  const consumed=await UserSession.findOneAndUpdate({_id:id,usedAt:null,revokedAt:null},{$set:{usedAt:new Date()}},{session,new:true});
  if(!consumed)throw denied();
  const user=await User.findOne({_id:previous.userId,status:'active'}).session(session);if(!user)throw denied();
  result=await issue(user,previous.familyId,session,previous.device??undefined);
 });
 return result!;
}
export async function forgotPassword(email:string){
 if(!env.SMTP_URL||!env.MAIL_FROM)throw new AppError(503,'EMAIL_UNAVAILABLE','Password recovery is temporarily unavailable');
 const user=await User.findOne({email});if(!user)return;
 const token=randomBytes(48).toString('base64url');
 await mongoose.connection.transaction(async session=>{
  await PasswordReset.create([{userId:user._id,hash:hashToken(token),expiresAt:new Date(Date.now()+30*60000)}],{session});
  await Outbox.create([{kind:'password_reset',key:randomUUID(),payload:{email:user.email,token}}],{session});
 });
}
export async function resetPassword(token:string,password:string){
 const passwordHash=await argon2.hash(password,options);
 await mongoose.connection.transaction(async session=>{
  const reset=await PasswordReset.findOneAndUpdate({hash:hashToken(token),usedAt:null,expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{session,new:true});
  if(!reset)throw new AppError(400,'INVALID_RESET','Reset link is invalid or expired');
  await User.updateOne({_id:reset.userId},{$set:{passwordHash}},{session});
  await UserSession.updateMany({userId:reset.userId},{$set:{revokedAt:new Date()}},{session});
 });
}
export interface IdentityProvider {verify(idToken:string):Promise<{subject:string;email:string;emailVerified:boolean}>}
