import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { User,UserSession } from '../modules/auth/models.js';
declare module 'express-serve-static-core' {interface Request {auth?:{userId:string;role:string;familyId:string}}}
export const authenticate:RequestHandler=async(req,_res,next)=>{
 try{
  const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw new Error();
  const {payload}=await jwtVerify(token,new TextEncoder().encode(env.JWT_SECRET),{algorithms:['HS256'],issuer:'kmart-api',audience:'kmart-client'});
  if(!payload.sub||typeof payload.sid!=='string')throw new Error();
  const session=await UserSession.exists({userId:payload.sub,familyId:payload.sid,revokedAt:null,usedAt:null,expiresAt:{$gt:new Date()}});
  const user=await User.findOne({_id:payload.sub,status:'active'}).select('role').lean();
  if(!session||!user)throw new Error();req.auth={userId:payload.sub,role:user.role??'customer',familyId:payload.sid};next();
 }catch{next(new AppError(401,'UNAUTHORIZED','Please sign in again'));}
};
export const adminOnly:RequestHandler=(req,_res,next)=>{if(req.auth?.role!=='admin')return next(new AppError(403,'FORBIDDEN','Administrator access required'));next();};
