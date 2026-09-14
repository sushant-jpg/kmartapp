import { Router } from 'express';
import type { Request,Response } from 'express';
import { z } from 'zod';
import { registerSchema,loginSchema } from '@kmart/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import * as service from './service.js';
import { User,UserSession } from './models.js';
export const authRouter=Router();
const cookie={httpOnly:true,secure:env.COOKIE_SECURE==='true',sameSite:'strict' as const,path:'/api/v1/auth',maxAge:30*86400000};
function sendSession(req:Request,res:Response,data:Awaited<ReturnType<typeof service.login>>){
 if(req.headers['x-client']==='admin'){checkOrigin(req);res.cookie('refresh',data.refreshToken,cookie);res.json({success:true,data:{accessToken:data.accessToken,user:data.user}});}else res.json({success:true,data});
}
function checkOrigin(req:Request){if(!req.headers.origin||!env.ALLOWED_ORIGINS.split(',').includes(req.headers.origin))throw new AppError(403,'INVALID_ORIGIN','Request origin is not permitted');}
authRouter.post('/register',rateLimit('auth',10,900000),async(req,res)=>sendSession(req,res,await service.register(registerSchema.parse(req.body),req.headers['user-agent']?.slice(0,200))));
authRouter.post('/login',rateLimit('auth',10,900000),async(req,res)=>sendSession(req,res,await service.login(loginSchema.parse(req.body),req.headers['user-agent']?.slice(0,200))));
authRouter.post('/refresh',rateLimit('refresh',30),async(req,res)=>{if(req.cookies.refresh)checkOrigin(req);const token=z.string().max(500).parse(req.cookies.refresh??req.body?.refreshToken);sendSession(req,res,await service.refresh(token));});
authRouter.post('/logout',authenticate,async(req,res)=>{await UserSession.updateMany({userId:req.auth!.userId,familyId:req.auth!.familyId},{$set:{revokedAt:new Date()}});res.clearCookie('refresh',cookie);res.json({success:true,data:{}});});
authRouter.get('/me',authenticate,async(req,res)=>res.json({success:true,data:await User.findById(req.auth!.userId).lean()}));
authRouter.get('/sessions',authenticate,async(req,res)=>res.json({success:true,data:await UserSession.find({userId:req.auth!.userId,usedAt:null,revokedAt:null,expiresAt:{$gt:new Date()}}).select('familyId device createdAt expiresAt').limit(50).lean()}));
authRouter.delete('/sessions',authenticate,async(req,res)=>{await UserSession.updateMany({userId:req.auth!.userId},{$set:{revokedAt:new Date()}});res.clearCookie('refresh',cookie);res.json({success:true,data:{}});});
authRouter.post('/forgot-password',rateLimit('reset',3,3600000),async(req,res)=>{await service.forgotPassword(z.email().toLowerCase().parse(req.body.email));res.json({success:true,data:{message:'If the account exists, a reset email will arrive shortly.'}});});
authRouter.post('/reset-password',rateLimit('reset-token',10,3600000),async(req,res)=>{const data=z.object({token:z.string().min(32).max(200),password:registerSchema.shape.password}).strict().parse(req.body);await service.resetPassword(data.token,data.password);res.json({success:true,data:{}});});
