-- A stored path must remain in its tenant after URL normalization by Storage.
begin;
alter table public.commercial_project_photos add constraint photo_storage_tenant_path check (
 storage_path is null or (
  storage_path like organization_id::text || '/%'
  and storage_path !~* '(^|/)([.]|%2e){1,2}(/|$)'
  and position(chr(92) in storage_path)=0
  and storage_path !~* '%(25)*(2e|2f|5c)'
 ));
alter table public.project_note_attachments add constraint attachment_storage_tenant_path check (
 storage_path like organization_id::text || '/%'
 and storage_path !~* '(^|/)([.]|%2e){1,2}(/|$)'
 and position(chr(92) in storage_path)=0
 and storage_path !~* '%(25)*(2e|2f|5c)'
);
commit;
