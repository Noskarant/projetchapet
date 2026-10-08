export function smsMobileNumber(value: unknown) {
 const input=typeof value==='string'?value.trim().replace(/[\s().-]/g,''):'';
 const international=input.startsWith('00')?`+${input.slice(2)}`:input;
 if(/^0[67]\d{8}$/.test(international))return `+33${international.slice(1)}`;
 if(international.startsWith('+33')&&!/^\+33[67]\d{8}$/.test(international))return '';
 return /^\+[1-9]\d{7,14}$/.test(international)?international:'';
}
export function quoteEmailSmsMessage(number:string,company:string){return `Bonjour, ${company||'votre artisan'} vient de vous envoyer le devis ${number} par e-mail. Pensez à consulter vos messages et vos courriers indésirables.`;}
export function automaticSmsConfigured(){return Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&(process.env.TWILIO_MESSAGING_SERVICE_SID||process.env.TWILIO_FROM_NUMBER));}
export async function notifyQuoteEmailBySms(phone:string,message:string){
 if(!automaticSmsConfigured())return {status:'manual' as const,phone,message};
 const sid=process.env.TWILIO_ACCOUNT_SID!;
 if(!/^AC[a-f0-9]{32}$/i.test(sid))return {status:'failed' as const,phone,message};
 const body=new URLSearchParams({To:phone,Body:message});
 if(process.env.TWILIO_MESSAGING_SERVICE_SID)body.set('MessagingServiceSid',process.env.TWILIO_MESSAGING_SERVICE_SID);else body.set('From',process.env.TWILIO_FROM_NUMBER!);
 try{
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',signal:AbortSignal.timeout(10_000),headers:{Authorization:`Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||typeof result.sid!=='string'||['failed','undelivered','canceled'].includes(result.status))return {status:'failed' as const,phone,message};
  return {status:'queued' as const};
 }catch{return {status:'uncertain' as const};}
}
