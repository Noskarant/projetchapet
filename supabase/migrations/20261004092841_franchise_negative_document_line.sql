-- Allow a negative price only on a labelled franchise. Keep other prices,
-- quantities, ownership checks, invoice immutability and business-role checks intact.
create or replace function private.document_line_unit_price(item jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when item->>'unit_price' is null then null
    when trim(item->>'label') ~* '^franchise([[:space:]]|$)' then (item->>'unit_price')::numeric
    else greatest(0, (item->>'unit_price')::numeric) end
$$;
revoke all on function private.document_line_unit_price(jsonb) from public, anon;
grant execute on function private.document_line_unit_price(jsonb) to authenticated, service_role;

do $$ declare r record; definition text; updated text; changed integer := 0; begin
  for r in select oid from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('save_quote_document', 'save_invoice_document') loop
    definition := pg_get_functiondef(r.oid);
    updated := replace(definition,
      'greatest(0, coalesce((item->>''unit_price'')::numeric, 0))',
      'coalesce(private.document_line_unit_price(item), 0)');
    updated := replace(updated,
      'case when item->>''unit_price'' is null then null else greatest(0, (item->>''unit_price'')::numeric) end',
      'private.document_line_unit_price(item)');
    if updated = definition or strpos(updated, 'private.document_line_unit_price(item)') = 0 then
      raise exception 'Unexpected financial RPC definition; franchise migration aborted';
    end if;
    execute updated;
    changed := changed + 1;
  end loop;
  if changed <> 2 then raise exception 'Both document RPCs are required'; end if;
end $$;
