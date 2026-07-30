create schema if not exists private;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

create or replace function private.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, text[]) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

-- Separate the public demo workspace from authenticated organizations.
drop policy if exists "demo read organization" on public.organizations;
create policy "demo read organization"
on public.organizations for select to anon
using (id = '11111111-1111-4111-8111-111111111111'::uuid);

drop policy if exists "members can read organizations" on public.organizations;
create policy "members can read organizations"
on public.organizations for select to authenticated
using (private.is_org_member(id));

drop policy if exists "admins can update organizations" on public.organizations;
create policy "admins can update organizations"
on public.organizations for update to authenticated
using (private.has_org_role(id, array['owner', 'admin']))
with check (private.has_org_role(id, array['owner', 'admin']));

drop policy if exists "members can read memberships" on public.organization_members;
create policy "members can read memberships"
on public.organization_members for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "admins can add memberships" on public.organization_members;
create policy "admins can add memberships"
on public.organization_members for insert to authenticated
with check (private.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists "admins can update memberships" on public.organization_members;
create policy "admins can update memberships"
on public.organization_members for update to authenticated
using (private.has_org_role(organization_id, array['owner', 'admin']))
with check (private.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists "owners can remove memberships" on public.organization_members;
create policy "owners can remove memberships"
on public.organization_members for delete to authenticated
using (private.has_org_role(organization_id, array['owner']));

drop policy if exists "members read audit log" on public.audit_log;
create policy "members read audit log"
on public.audit_log for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "demo manage customers" on public.customers;
create policy "demo manage customers"
on public.customers for all to anon
using (organization_id = '11111111-1111-4111-8111-111111111111'::uuid)
with check (organization_id = '11111111-1111-4111-8111-111111111111'::uuid);

drop policy if exists "members manage customers" on public.customers;
create policy "members manage customers"
on public.customers for all to authenticated
using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

drop policy if exists "demo manage quotes" on public.quotes;
create policy "demo manage quotes"
on public.quotes for all to anon
using (organization_id = '11111111-1111-4111-8111-111111111111'::uuid)
with check (organization_id = '11111111-1111-4111-8111-111111111111'::uuid);

drop policy if exists "members manage quotes" on public.quotes;
create policy "members manage quotes"
on public.quotes for all to authenticated
using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

drop policy if exists "demo manage quote items" on public.quote_items;
create policy "demo manage quote items"
on public.quote_items for all to anon
using (exists (
  select 1 from public.quotes q
  where q.id = quote_items.quote_id
    and q.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
))
with check (exists (
  select 1 from public.quotes q
  where q.id = quote_items.quote_id
    and q.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
));

drop policy if exists "members manage quote items" on public.quote_items;
create policy "members manage quote items"
on public.quote_items for all to authenticated
using (exists (
  select 1 from public.quotes q
  where q.id = quote_items.quote_id
    and private.is_org_member(q.organization_id)
))
with check (exists (
  select 1 from public.quotes q
  where q.id = quote_items.quote_id
    and private.is_org_member(q.organization_id)
));

drop policy if exists "demo manage invoices" on public.invoices;
create policy "demo manage invoices"
on public.invoices for all to anon
using (organization_id = '11111111-1111-4111-8111-111111111111'::uuid)
with check (organization_id = '11111111-1111-4111-8111-111111111111'::uuid);

drop policy if exists "members manage invoices" on public.invoices;
create policy "members manage invoices"
on public.invoices for all to authenticated
using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

drop policy if exists "demo manage invoice items" on public.invoice_items;
create policy "demo manage invoice items"
on public.invoice_items for all to anon
using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id
    and i.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
))
with check (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id
    and i.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
));

drop policy if exists "members manage invoice items" on public.invoice_items;
create policy "members manage invoice items"
on public.invoice_items for all to authenticated
using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id
    and private.is_org_member(i.organization_id)
))
with check (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id
    and private.is_org_member(i.organization_id)
));

drop policy if exists "demo manage payments" on public.payments;
create policy "demo manage payments"
on public.payments for all to anon
using (exists (
  select 1 from public.invoices i
  where i.id = payments.invoice_id
    and i.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
))
with check (exists (
  select 1 from public.invoices i
  where i.id = payments.invoice_id
    and i.organization_id = '11111111-1111-4111-8111-111111111111'::uuid
));

drop policy if exists "members manage payments" on public.payments;
create policy "members manage payments"
on public.payments for all to authenticated
using (exists (
  select 1 from public.invoices i
  where i.id = payments.invoice_id
    and private.is_org_member(i.organization_id)
))
with check (exists (
  select 1 from public.invoices i
  where i.id = payments.invoice_id
    and private.is_org_member(i.organization_id)
));

-- The old public helper functions are no longer used by policies.
drop function if exists public.is_org_member(uuid);
drop function if exists public.has_org_role(uuid, text[]);

revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.ensure_personal_organization() from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.ensure_personal_organization() to authenticated;

create or replace function private.active_organization_id()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return '11111111-1111-4111-8111-111111111111'::uuid;
  end if;
  return public.ensure_personal_organization();
end;
$$;

revoke all on function private.active_organization_id() from public, anon, authenticated;

create or replace function private.next_document_number(target_org uuid, document_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_value integer;
  current_year text := extract(year from current_date)::integer::text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_org::text || ':' || document_prefix || ':' || current_year, 0));

  if document_prefix = 'DEV' then
    select coalesce(max(substring(number from '([0-9]+)$')::integer), 0) + 1
      into next_value
      from public.quotes
      where organization_id = target_org
        and number like 'DEV-' || current_year || '-%';
  elsif document_prefix = 'FAC' then
    select coalesce(max(substring(number from '([0-9]+)$')::integer), 0) + 1
      into next_value
      from public.invoices
      where organization_id = target_org
        and number like 'FAC-' || current_year || '-%';
  else
    raise exception 'document prefix not supported';
  end if;

  return document_prefix || '-' || current_year || '-' || lpad(next_value::text, 3, '0');
end;
$$;

create or replace function public.save_quote_document(
  p_quote_id uuid,
  p_customer_id uuid,
  p_title text,
  p_status public.quote_status,
  p_issue_date date,
  p_expiry_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
  saved_id uuid := p_quote_id;
  document_number text;
  subtotal_value numeric := 0;
  tax_value numeric := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'invalid quote items';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and organization_id = target_org) then
    raise exception 'customer not found in active organization';
  end if;

  select
    coalesce(sum(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0))), 0),
    coalesce(sum(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0)) * greatest(0, coalesce((item->>'tax_rate')::numeric, 0)) / 100), 0)
  into subtotal_value, tax_value
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item;

  subtotal_value := round(subtotal_value, 2);
  tax_value := round(tax_value, 2);

  if saved_id is null then
    document_number := private.next_document_number(target_org, 'DEV');
    insert into public.quotes (
      organization_id, customer_id, number, title, status, issue_date, expiry_date,
      subtotal, tax_total, total, notes, sent_at, accepted_at
    ) values (
      target_org, p_customer_id, document_number, coalesce(nullif(trim(p_title), ''), 'Travaux'),
      p_status, p_issue_date, p_expiry_date, subtotal_value, tax_value, subtotal_value + tax_value,
      p_notes, case when p_status = 'sent' then now() else null end,
      case when p_status = 'accepted' then now() else null end
    ) returning id into saved_id;
  else
    if not exists (select 1 from public.quotes where id = saved_id and organization_id = target_org) then
      raise exception 'quote not found in active organization';
    end if;
    update public.quotes
      set customer_id = p_customer_id,
          title = coalesce(nullif(trim(p_title), ''), 'Travaux'),
          status = p_status,
          issue_date = p_issue_date,
          expiry_date = p_expiry_date,
          subtotal = subtotal_value,
          tax_total = tax_value,
          total = subtotal_value + tax_value,
          notes = p_notes,
          sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
          accepted_at = case when p_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end
      where id = saved_id and organization_id = target_org;
    delete from public.quote_items where quote_id = saved_id;
  end if;

  insert into public.quote_items (quote_id, position, label, description, quantity, unit, unit_price, tax_rate, total)
  select
    saved_id,
    row_number() over () - 1,
    coalesce(nullif(trim(item->>'label'), ''), 'Prestation'),
    nullif(trim(item->>'description'), ''),
    greatest(0, coalesce((item->>'quantity')::numeric, 0)),
    nullif(trim(item->>'unit'), ''),
    greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
    greatest(0, coalesce((item->>'tax_rate')::numeric, 0)),
    round(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0)), 2)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item;

  return saved_id;
end;
$$;

create or replace function public.save_invoice_document(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_quote_id uuid,
  p_status public.invoice_status,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
  saved_id uuid := p_invoice_id;
  existing_status public.invoice_status;
  document_number text;
  subtotal_value numeric := 0;
  tax_value numeric := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'invalid invoice items';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and organization_id = target_org) then
    raise exception 'customer not found in active organization';
  end if;
  if p_quote_id is not null and not exists (select 1 from public.quotes where id = p_quote_id and organization_id = target_org) then
    raise exception 'quote not found in active organization';
  end if;

  select
    coalesce(sum(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0))), 0),
    coalesce(sum(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0)) * greatest(0, coalesce((item->>'tax_rate')::numeric, 0)) / 100), 0)
  into subtotal_value, tax_value
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item;

  subtotal_value := round(subtotal_value, 2);
  tax_value := round(tax_value, 2);

  if saved_id is null then
    document_number := private.next_document_number(target_org, 'FAC');
    insert into public.invoices (
      organization_id, customer_id, quote_id, number, status, issue_date, due_date,
      subtotal, tax_total, total, paid_total, notes, sent_at
    ) values (
      target_org, p_customer_id, p_quote_id, document_number, 'draft', p_issue_date, p_due_date,
      subtotal_value, tax_value, subtotal_value + tax_value, 0, p_notes, null
    ) returning id into saved_id;
  else
    select status into existing_status
      from public.invoices
      where id = saved_id and organization_id = target_org
      for update;
    if existing_status is null then
      raise exception 'invoice not found in active organization';
    end if;
    if existing_status <> 'draft' then
      raise exception 'an issued invoice cannot be edited; create a credit note or corrective document';
    end if;
    update public.invoices
      set customer_id = p_customer_id,
          quote_id = p_quote_id,
          issue_date = p_issue_date,
          due_date = p_due_date,
          subtotal = subtotal_value,
          tax_total = tax_value,
          total = subtotal_value + tax_value,
          notes = p_notes
      where id = saved_id and organization_id = target_org;
    delete from public.invoice_items where invoice_id = saved_id;
  end if;

  insert into public.invoice_items (invoice_id, position, label, description, quantity, unit, unit_price, tax_rate, total)
  select
    saved_id,
    row_number() over () - 1,
    coalesce(nullif(trim(item->>'label'), ''), 'Prestation'),
    nullif(trim(item->>'description'), ''),
    greatest(0, coalesce((item->>'quantity')::numeric, 0)),
    nullif(trim(item->>'unit'), ''),
    greatest(0, coalesce((item->>'unit_price')::numeric, 0)),
    greatest(0, coalesce((item->>'tax_rate')::numeric, 0)),
    round(greatest(0, coalesce((item->>'quantity')::numeric, 0)) * greatest(0, coalesce((item->>'unit_price')::numeric, 0)), 2)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item;

  update public.invoices
    set status = p_status,
        paid_total = case when p_status = 'paid' then subtotal_value + tax_value else 0 end,
        sent_at = case when p_status in ('sent', 'issued') then coalesce(sent_at, now()) else sent_at end
    where id = saved_id and organization_id = target_org;

  return saved_id;
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
  invoice_total numeric;
  already_paid numeric;
  next_paid numeric;
begin
  select total, paid_total
    into invoice_total, already_paid
    from public.invoices
    where id = p_invoice_id and organization_id = target_org
    for update;

  if not found then
    raise exception 'invoice not found in active organization';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  next_paid := least(invoice_total, already_paid + p_amount);
  if next_paid <= already_paid then
    return;
  end if;

  insert into public.payments (invoice_id, amount, paid_at, method, reference)
  values (p_invoice_id, next_paid - already_paid, coalesce(p_paid_at, now()), nullif(trim(p_method), ''), nullif(trim(p_reference), ''));

  update public.invoices
    set paid_total = next_paid,
        status = case when next_paid >= invoice_total then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
    where id = p_invoice_id and organization_id = target_org;
end;
$$;

revoke all on function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) from public;
revoke all on function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) from public;
revoke all on function public.record_invoice_payment(uuid, numeric, timestamptz, text, text) from public;
grant execute on function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) to anon, authenticated;
grant execute on function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) to anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, numeric, timestamptz, text, text) to anon, authenticated;

create or replace function private.protect_invoice_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'an issued invoice cannot be deleted';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if new.status = 'draft' then
      raise exception 'an issued invoice cannot return to draft';
    end if;
    if (new.organization_id, new.customer_id, new.quote_id, new.number, new.issue_date, new.due_date, new.subtotal, new.tax_total, new.total, new.notes)
       is distinct from
       (old.organization_id, old.customer_id, old.quote_id, old.number, old.issue_date, old.due_date, old.subtotal, old.tax_total, old.total, old.notes) then
      raise exception 'an issued invoice cannot be edited; create a credit note or corrective document';
    end if;
    if new.paid_total < old.paid_total then
      raise exception 'paid amount cannot be reduced';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.protect_invoice_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  parent_status public.invoice_status;
begin
  select status into parent_status from public.invoices where id = target_invoice;
  if parent_status is distinct from 'draft'::public.invoice_status then
    raise exception 'items of an issued invoice cannot be changed';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.protect_payment_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_invoice uuid := old.invoice_id;
  parent_status public.invoice_status;
begin
  select status into parent_status from public.invoices where id = target_invoice;
  if parent_status is distinct from 'draft'::public.invoice_status then
    raise exception 'payment history of an issued invoice cannot be changed';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_protect_issued on public.invoices;
create trigger invoices_protect_issued
before update or delete on public.invoices
for each row execute function private.protect_invoice_row();

drop trigger if exists invoice_items_protect_issued on public.invoice_items;
create trigger invoice_items_protect_issued
before insert or update or delete on public.invoice_items
for each row execute function private.protect_invoice_items();

drop trigger if exists payments_protect_history on public.payments;
create trigger payments_protect_history
before update or delete on public.payments
for each row execute function private.protect_payment_history();

create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_org uuid;
  target_id uuid;
begin
  if tg_table_name = 'payments' then
    select organization_id into target_org from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
    target_id := coalesce(new.id, old.id);
  else
    target_org := coalesce(new.organization_id, old.organization_id);
    target_id := coalesce(new.id, old.id);
  end if;

  if tg_table_name = 'quotes' then
    row_data := row_data - 'signature_data';
  elsif tg_table_name = 'invoices' then
    row_data := row_data - 'e_invoice_payload';
  end if;

  insert into public.audit_log (organization_id, user_id, entity_type, entity_id, action, payload)
  values (target_org, auth.uid(), tg_table_name, target_id, lower(tg_op), row_data);

  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_business_change() from public, anon, authenticated;

drop trigger if exists customers_audit on public.customers;
create trigger customers_audit after insert or update or delete on public.customers
for each row execute function private.audit_business_change();

drop trigger if exists quotes_audit on public.quotes;
create trigger quotes_audit after insert or update or delete on public.quotes
for each row execute function private.audit_business_change();

drop trigger if exists invoices_audit on public.invoices;
create trigger invoices_audit after insert or update or delete on public.invoices
for each row execute function private.audit_business_change();

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments
for each row execute function private.audit_business_change();

create index if not exists audit_log_organization_id_idx on public.audit_log (organization_id);
create index if not exists audit_log_user_id_idx on public.audit_log (user_id);
create index if not exists quote_items_quote_id_idx on public.quote_items (quote_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists quotes_customer_id_idx on public.quotes (customer_id);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_quote_id_idx on public.invoices (quote_id);
create index if not exists payments_invoice_id_idx on public.payments (invoice_id);
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
