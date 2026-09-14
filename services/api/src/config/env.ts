import { z } from 'zod';
const schema = z.object({
 NODE_ENV:z.enum(['development','test','staging','production']).default('development'), PORT:z.coerce.number().int().default(4000),
 MONGO_URI:z.string().min(1), REDIS_URL:z.url(), JWT_SECRET:z.string().min(48),
 ALLOWED_ORIGINS:z.string().min(1), ADMIN_URL:z.url().default('http://localhost:5173'),
 COOKIE_SECURE:z.enum(['true','false']).default('false'), LOG_LEVEL:z.enum(['debug','info','warn','error','silent']).default('info'),
 SHIPPING_MINOR:z.coerce.number().int().nonnegative().default(15000), TAX_BPS:z.coerce.number().int().min(0).max(10000).default(0),
 PAYMENT_WEBHOOK_SECRET:z.string().min(32).optional(), STRIPE_SECRET_KEY:z.string().optional(),
 SMTP_URL:z.string().optional(), MAIL_FROM:z.email().optional(), SENTRY_DSN:z.url().optional()
});
export function parseEnv(input:Record<string,string|undefined>) {
 const value=schema.parse(input);
 if(['production','staging'].includes(value.NODE_ENV) && (value.COOKIE_SECURE!=='true' || value.ALLOWED_ORIGINS.split(',').some(o=>!o.startsWith('https://')) || /example|development|change.me/i.test(value.JWT_SECRET))) throw new Error('Production requires HTTPS origins, secure cookies and a unique secret');
 return value;
}
export const env=parseEnv(process.env);
