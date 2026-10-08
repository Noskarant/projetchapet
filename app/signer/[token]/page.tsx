import type { Metadata } from 'next';
import SignatureClient from './signature-client';
export const metadata:Metadata={title:'Bon pour accord — MANUFEO',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <SignatureClient token={token}/>;}
