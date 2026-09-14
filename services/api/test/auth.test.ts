import { expect,it } from 'vitest';
import request from 'supertest';
import { app } from '../src/routes.js';
import { User,UserSession,PasswordReset } from '../src/modules/auth/models.js';
import { hashToken,resetPassword } from '../src/modules/auth/service.js';
import { useDatabase } from './database.js';
useDatabase();
const details={fullName:'Test Customer',username:'customer',email:'customer@example.com',password:'A-long-test-password-123'};
it('registers, rotates tokens, revokes replayed token families, and never exposes hashes',async()=>{
 await Promise.all([User.init(),UserSession.init(),PasswordReset.init()]);
 const registration=await request(app).post('/api/v1/auth/register').send(details);expect(registration.status).toBe(200);expect(registration.body.data.user.passwordHash).toBeUndefined();
 const login=await request(app).post('/api/v1/auth/login').send({identifier:'customer',password:details.password});expect(login.status).toBe(200);
 const first=login.body.data;const rotated=await request(app).post('/api/v1/auth/refresh').send({refreshToken:first.refreshToken});expect(rotated.status).toBe(200);expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);
 expect((await request(app).get('/api/v1/auth/me').auth(rotated.body.data.accessToken,{type:'bearer'})).status).toBe(200);
 expect((await request(app).post('/api/v1/auth/refresh').send({refreshToken:first.refreshToken})).status).toBe(401);
 expect((await request(app).get('/api/v1/auth/me').auth(rotated.body.data.accessToken,{type:'bearer'})).status).toBe(401);
});
it('rejects injection and invalid passwords',async()=>{
 expect((await request(app).post('/api/v1/auth/login').send({identifier:{$ne:null},password:'anything'})).status).toBe(400);
 expect((await request(app).post('/api/v1/auth/login').send({identifier:'customer',password:'wrong'})).status).toBe(401);
 expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
});
it('consumes password resets only once and revokes sessions',async()=>{
 const user=await User.findOne({email:details.email});await PasswordReset.create({userId:user!._id,hash:hashToken('test-reset'),expiresAt:new Date(Date.now()+60000)});
 await resetPassword('test-reset','New-long-password-123');await expect(resetPassword('test-reset','Other-long-password-123')).rejects.toThrow();
 expect(await UserSession.countDocuments({userId:user!._id,revokedAt:null})).toBe(0);
});
