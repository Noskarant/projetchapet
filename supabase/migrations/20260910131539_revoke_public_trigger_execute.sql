-- Durcissement Phase 4 : le helper de trigger n'a pas à être exposé aux rôles publics.
-- Les triggers PostgreSQL continuent de l'exécuter sans dépendre d'un droit RPC client.

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;

grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.set_updated_at() to service_role;
