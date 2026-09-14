export class AppError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export function requireValue<T>(value:T,code='NOT_FOUND'):NonNullable<T> {if(value==null)throw new AppError(404,code,'Resource not found');return value;}
