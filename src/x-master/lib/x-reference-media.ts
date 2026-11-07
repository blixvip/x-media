export type ReferenceBucket={
 put(key:string,body:Uint8Array|ReadableStream,options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>;
 get?(key:string,options?:{range?:{offset:number;length:number}}):Promise<{body:ReadableStream;size:number}|null>;
 delete?(key:string):Promise<unknown>;
};
export function parseByteRange(header:string,size:number):{offset:number;length:number}|null{
 const match=header.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2])||size<=0)return null;
 const offset=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));const end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
 return Number.isSafeInteger(offset)&&offset>=0&&offset<size&&end>=offset?{offset,length:end-offset+1}:null;
}
export function mediaSignature(bytes:Uint8Array,kind:string):string|null{
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 if(kind==='video')return ascii(4,8)==='ftyp'?'video/mp4':null;
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
 if(ascii(0,6)==='GIF87a'||ascii(0,6)==='GIF89a')return 'image/gif';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';return null;
}
