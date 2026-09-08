revoke all on function private.next_document_number(uuid, text) from public, anon;
grant execute on function private.next_document_number(uuid, text) to authenticated;
