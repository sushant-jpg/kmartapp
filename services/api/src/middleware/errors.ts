import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
export const errorHandler:ErrorRequestHandler=(err:unknown,_req,res,_next)=>{
 if(err instanceof ZodError){res.status(400).json({success:false,error:{code:'VALIDATION_ERROR',message:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}});return;}
 if(err instanceof AppError){res.status(err.status).json({success:false,error:{code:err.code,message:err.message}});return;}
 if(typeof err==='object'&&err!==null&&'code' in err&&err.code===11000){res.status(409).json({success:false,error:{code:'CONFLICT',message:'A record with these details already exists'}});return;}
 logger.error({name:err instanceof Error?err.name:'UnknownError'},'Unhandled request error');
 res.status(500).json({success:false,error:{code:'INTERNAL_ERROR',message:'An unexpected error occurred'}});
};
