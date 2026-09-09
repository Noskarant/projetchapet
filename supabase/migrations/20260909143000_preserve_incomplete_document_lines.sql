-- Unification mobile / desktop : les lignes dictées incomplètes doivent conserver leurs null réels.
-- Le calcul financier continue de traiter les valeurs inconnues comme 0 uniquement pour les totaux,
-- sans transformer les données sources en faux zéros.

alter table public.quote_items
  alter column quantity drop not null,
  alter column unit_price drop not null,
  alter column tax_rate drop not null;

alter table public.invoice_items
  alter column quantity drop not null,
  alter column unit_price drop not null,
  alter column tax_rate drop not null;

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
    case when item->>'quantity' is null then null else greatest(0, (item->>'quantity')::numeric) end,
    nullif(trim(item->>'unit'), ''),
    case when item->>'unit_price' is null then null else greatest(0, (item->>'unit_price')::numeric) end,
    case when item->>'tax_rate' is null then null else greatest(0, (item->>'tax_rate')::numeric) end,
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
    case when item->>'quantity' is null then null else greatest(0, (item->>'quantity')::numeric) end,
    nullif(trim(item->>'unit'), ''),
    case when item->>'unit_price' is null then null else greatest(0, (item->>'unit_price')::numeric) end,
    case when item->>'tax_rate' is null then null else greatest(0, (item->>'tax_rate')::numeric) end,
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

-- Les fonctions restent exclusivement disponibles avec une session authentifiée.
revoke execute on function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) from public, anon;
revoke execute on function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) from public, anon;
grant execute on function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) to authenticated;
grant execute on function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) to authenticated;
