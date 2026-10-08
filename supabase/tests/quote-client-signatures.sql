begin;
do $$
declare organization uuid; customer uuid; quote uuid; request_id uuid; proof uuid; token text:=md5(random()::text)||md5(random()::text);
begin
 select organization_id,id into organization,customer from public.customers limit 1;
 if customer is null then raise exception 'Test requires one existing customer'; end if;
 insert into public.quotes(organization_id,customer_id,number,title,subtotal,tax_total,total)
 values(organization,customer,'TEST-SIGN-'||gen_random_uuid()::text,'Signature rollback fixture',100,10,110) returning id into quote;
 insert into public.quote_items(quote_id,position,label,quantity,unit,unit_price,tax_rate,total) values(quote,0,'Test',1,'U',100,10,100);
 insert into public.quote_signature_requests(organization_id,quote_id,token_hash,signer_email,document_number,document_snapshot,pdf_hash,storage_path)
 select organization,quote,token,'test@example.invalid',q.number,public.quote_signature_snapshot(quote),repeat('a',64),organization||'/fixture.pdf' from public.quotes q where id=quote returning id into request_id;
 update public.quote_items set unit_price=200,total=200 where quote_id=quote;
 begin
  perform public.accept_quote_signature(token,'Client Test',repeat('b',64),'test');
  raise exception 'FAIL: changed quote accepted';
 exception when others then if sqlerrm not like '%quote_changed%' then raise; end if; end;
 update public.quote_items set unit_price=100,total=100 where quote_id=quote;
 update public.quote_signature_requests set expires_at=now()-interval '1 day' where id=request_id;
 begin
  perform public.accept_quote_signature(token,'Client Test',repeat('b',64),'test');
  raise exception 'FAIL: expired request accepted';
 exception when others then if sqlerrm not like '%signature_link_expired%' then raise; end if; end;
 update public.quote_signature_requests set expires_at=now()+interval '1 day' where id=request_id;
 proof:=public.accept_quote_signature(token,'Client Test',repeat('b',64),'test');
 if (select status from public.quotes where id=quote)<>'accepted' then raise exception 'FAIL: quote not accepted'; end if;
 if public.accept_quote_signature(token,'Other name',repeat('b',64),'test')<>proof then raise exception 'FAIL: duplicate signature'; end if;
 if (select count(*) from public.document_signatures where signature_request_id=request_id)<>1 then raise exception 'FAIL: duplicate proof'; end if;
 if has_table_privilege('anon','public.quote_signature_requests','SELECT') or has_table_privilege('authenticated','public.quote_signature_requests','SELECT') then raise exception 'FAIL: signature tokens exposed'; end if;
 if has_function_privilege('anon','public.accept_quote_signature(text,text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.accept_quote_signature(text,text,text,text)','EXECUTE') then raise exception 'FAIL: public signature RPC'; end if;
end $$;
rollback;
