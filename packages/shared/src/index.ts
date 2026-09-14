import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
export const money = z.number().int().min(0).max(1_000_000_000);
export const registerSchema = z.object({fullName:z.string().trim().min(2).max(100),username:z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),email:z.email().toLowerCase(),password:z.string().min(12).max(128)}).strict();
export const loginSchema = z.object({identifier:z.string().trim().toLowerCase().min(3).max(254),password:z.string().min(1).max(128)}).strict();
export const addressSchema = z.object({label:z.string().max(40),recipient:z.string().min(2).max(100),phone:z.string().regex(/^\+?[\d -]{7,20}$/),province:z.string().min(1).max(100),city:z.string().min(1).max(100),area:z.string().max(100),street:z.string().min(1).max(200),postalCode:z.string().max(20).optional(),deliveryInstructions:z.string().max(500).optional(),isDefault:z.boolean().default(false)}).strict();
export const cartItemSchema = z.object({productId:objectId,variantId:objectId.optional(),quantity:z.number().int().min(1).max(20)}).strict();
export const checkoutSchema = z.object({addressId:objectId,paymentMethod:z.enum(['cod','stripe','khalti','esewa']),coupon:z.string().trim().toUpperCase().max(40).optional()}).strict();
export const orderStatuses = ['pending_payment','payment_confirmed','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancel_requested','cancelled','return_requested','returned','refund_pending','refunded'] as const;
export type OrderStatus = typeof orderStatuses[number];
export type ApiResult<T> = {success:true;data:T;meta?:{nextCursor?:string|null}} | {success:false;error:{code:string;message:string}};
export interface ProductCard { _id:string;name:string;slug:string;brand:string;category:string;description:string;shortDescription:string;regularPrice:number;salePrice?:number;thumbnail:string;images:string[];stock:number;reservedStock:number;averageRating:number;reviewCount:number;specifications:Record<string,string>;tags:string[];reason?:string }
export interface AuthResult {accessToken:string;refreshToken?:string;user:{id:string;fullName:string;role:string}}
export interface CartLine {productId:string;variantId?:string;quantity:number;name:string;price:number;thumbnail:string;available:number}
export interface CartResult {items:CartLine[];subtotal:number;discount:number;shipping:number;tax:number;total:number}
export const formatMoney = (minor:number) => new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR',maximumFractionDigits:0}).format(minor/100);
