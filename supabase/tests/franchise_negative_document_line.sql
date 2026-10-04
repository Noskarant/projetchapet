-- Run after the migration. Every synthetic customer/document/counter change is rolled back.
begin;
do $$ declare uid uuid; sid uuid; org uuid; customer uuid; quote uuid; invoice uuid; begin
  if private.document_line_unit_price('{"label":"Franchise à déduire","unit_price":-113.64}') <> -113.64
    or private.document_line_unit_price('{"label":"Peinture","unit_price":-113.64}') <> 0
    or private.document_line_unit_price('{"label":"Franchise","unit_price":null}') is not null then
    raise exception 'Franchise price normalization failed';
  end if;
  select m.user_id, s.id into uid, sid from public.organization_members m
    join auth.sessions s on s.user_id = m.user_id where m.role = 'owner' limit 1;
  if uid is null then raise exception 'An authenticated owner session is required for rollback verification'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text,true);
  org := private.active_organization_id();
  insert into public.customers(organization_id,kind,last_name,first_name)
    values(org,'individual','TEST FRANCHISE ROLLBACK','Test') returning id into customer;
  quote := public.save_quote_document(null,customer,'Test franchise rollback','draft',current_date,current_date + 30,null,
    '[{"label":"Peinture","quantity":100,"unit":"m²","unit_price":23,"tax_rate":10},{"label":"Franchise à déduire","quantity":1,"unit":"forfait","unit_price":-113.64,"tax_rate":10}]');
  if not exists(select 1 from public.quotes where id=quote and subtotal=2186.36 and tax_total=218.64 and total=2405)
    or not exists(select 1 from public.quote_items where quote_id=quote and unit_price=-113.64 and total=-113.64) then
    raise exception 'Quote franchise persistence or totals failed';
  end if;
  invoice := public.save_invoice_document(null,customer,quote,'draft',current_date,current_date + 30,null,
    '[{"label":"Peinture","quantity":100,"unit":"m²","unit_price":23,"tax_rate":10},{"label":"Franchise à déduire","quantity":1,"unit":"forfait","unit_price":-113.64,"tax_rate":10}]');
  if not exists(select 1 from public.invoices where id=invoice and subtotal=2186.36 and tax_total=218.64 and total=2405)
    or not exists(select 1 from public.invoice_items where invoice_id=invoice and unit_price=-113.64 and total=-113.64) then
    raise exception 'Invoice franchise persistence or totals failed';
  end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.save_quote_document(null,customer,'Unauthorized','draft',current_date,current_date + 30,null,'[]');
    raise exception 'Unauthenticated request unexpectedly accepted';
  exception when insufficient_privilege then null; end;
end $$;
select true as franchise_quote_invoice_and_auth_verified;
rollback;
