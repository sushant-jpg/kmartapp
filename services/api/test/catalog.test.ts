import { it,expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/routes.js';
import { Product } from '../src/modules/catalog/models.js';
import { useDatabase } from './database.js';
useDatabase();
it('filters by actual sale price, searches safely, and paginates without leaking cost',async()=>{
 await Product.init();
 await Product.create([{name:'ASUS Coding Laptop',slug:'asus',sku:'A1',brand:'ASUS',category:'Laptop',regularPrice:15000000,salePrice:11000000,costPrice:5000000,stock:3,thumbnail:'https://example.com/a.jpg'},{name:'Samsung Phone',slug:'samsung',sku:'S1',brand:'Samsung',category:'Phone',regularPrice:5000000,stock:2,thumbnail:'https://example.com/b.jpg'}]);
 const response=await request(app).get('/api/v1/products').query({q:'ASUS',maxPrice:12000000});expect(response.status).toBe(200);expect(response.body.data).toHaveLength(1);expect(response.body.data[0].costPrice).toBeUndefined();
 const page=await request(app).get('/api/v1/products').query({limit:1});expect(page.body.meta.nextCursor).toBeTruthy();
 const next=await request(app).get('/api/v1/products').query({limit:1,cursor:page.body.meta.nextCursor});expect(next.body.data[0]._id).not.toBe(page.body.data[0]._id);
 expect((await request(app).get('/api/v1/products').query({q:'.*'})).body.data).toHaveLength(0);
 expect((await request(app).get('/api/v1/products').query({'brand[$ne]':''})).status).toBe(400);
});
