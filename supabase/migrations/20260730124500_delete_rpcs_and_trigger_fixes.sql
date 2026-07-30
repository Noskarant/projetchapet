create or replace function public.delete_quote_document(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
begin
  delete from public.quotes
  where id = p_quote_id
    and organization_id = target_org;

  if not found then
    raise exception 'quote not found in active organization';
  end if;
end;
$$;

create or replace function public.delete_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
  current_status public.invoice_status;
begin
  select status into current_status
  from public.invoices
  where id = p_invoice_id
    and organization_id = target_org
  for update;

  if not found then
    raise exception 'invoice not found in active organization';
  end if;
  if current_status <> 'draft' then
    raise exception 'only a draft invoice can be deleted';
  end if;

  delete from public.invoices
  where id = p_invoice_id
    and organization_id = target_org;
end;
$$;

revoke all on function public.delete_quote_document(uuid) from public;
revoke all on function public.delete_invoice_draft(uuid) from public;
grant execute on function public.delete_quote_document(uuid) to anon, authenticated;
grant execute on function public.delete_invoice_draft(uuid) to anon, authenticated;

create or replace function private.protect_invoice_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_invoice uuid;
  parent_status public.invoice_status;
begin
  if tg_op = 'DELETE' then
    target_invoice := old.invoice_id;
  else
    target_invoice := new.invoice_id;
  end if;

  select status into parent_status
  from public.invoices
  where id = target_invoice;

  if not found and tg_op = 'DELETE' then
    return old;
  end if;
  if parent_status is distinct from 'draft'::public.invoice_status then
    raise exception 'items of an issued invoice cannot be changed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb;
  target_org uuid;
  target_id uuid;
  payment_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  if tg_table_name = 'payments' then
    if tg_op = 'DELETE' then
      payment_invoice_id := old.invoice_id;
      target_id := old.id;
    else
      payment_invoice_id := new.invoice_id;
      target_id := new.id;
    end if;
    select organization_id into target_org
    from public.invoices
    where id = payment_invoice_id;
  else
    if tg_op = 'DELETE' then
      target_org := old.organization_id;
      target_id := old.id;
    else
      target_org := new.organization_id;
      target_id := new.id;
    end if;
  end if;

  if target_org is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'quotes' then
    row_data := row_data - 'signature_data';
  elsif tg_table_name = 'invoices' then
    row_data := row_data - 'e_invoice_payload';
  end if;

  insert into public.audit_log (organization_id, user_id, entity_type, entity_id, action, payload)
  values (target_org, auth.uid(), tg_table_name, target_id, lower(tg_op), row_data);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_business_change() from public, anon, authenticated;
