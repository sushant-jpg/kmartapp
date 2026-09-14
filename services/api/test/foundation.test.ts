import { expect,it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
it('serves a process liveness check',async()=>{const r=await request(app).get('/health');expect(r.status).toBe(200);expect(r.headers['x-content-type-options']).toBe('nosniff');});
it('rejects insecure production configuration',()=>{expect(()=>parseEnv({...process.env,NODE_ENV:'production'})).toThrow();});

it('accepts blank optional integrations from the example environment',()=>{const value=parseEnv({...process.env,MAIL_FROM:'',SMTP_URL:'',SENTRY_DSN:'',PAYMENT_WEBHOOK_SECRET:'',STRIPE_SECRET_KEY:''});expect(value.MAIL_FROM).toBeUndefined();expect(value.PAYMENT_WEBHOOK_SECRET).toBeUndefined();});
