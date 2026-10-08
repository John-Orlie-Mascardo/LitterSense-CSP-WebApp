-- Private photos. Only server credentials access objects; signed downloads expire.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('littersense-media', 'littersense-media', false, 2097152,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false, file_size_limit=2097152,
  allowed_mime_types=excluded.allowed_mime_types;
-- A pre-existing broad permissive policy must not expose this new bucket.
create policy littersense_media_server_only on storage.objects as restrictive
for all to anon,authenticated
using (bucket_id <> 'littersense-media')
with check (bucket_id <> 'littersense-media');
commit;
