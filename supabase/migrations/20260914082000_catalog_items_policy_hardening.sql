drop policy if exists "admins manage catalog items" on public.catalog_items;

drop policy if exists "admins create catalog items" on public.catalog_items;
create policy "admins create catalog items"
  on public.catalog_items for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner','admin','office']));

drop policy if exists "admins update catalog items" on public.catalog_items;
create policy "admins update catalog items"
  on public.catalog_items for update to authenticated
  using (private.has_org_role(organization_id, array['owner','admin','office']))
  with check (private.has_org_role(organization_id, array['owner','admin','office']));

drop policy if exists "admins delete catalog items" on public.catalog_items;
create policy "admins delete catalog items"
  on public.catalog_items for delete to authenticated
  using (private.has_org_role(organization_id, array['owner','admin','office']));
