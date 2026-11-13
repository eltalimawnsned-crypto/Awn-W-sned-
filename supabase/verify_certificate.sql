-- التحقق العام من الشهادات (صفحة #/verify في الموقع)
-- رقم الشهادة: آخر ستة أحرف من معرّف حساب الطالب + "-" + معرّف الدورة، مثل: 8D23A1-C1
-- تُعيد الدالة اسم صاحب الشهادة والدورة والنسبة والتاريخ فقط، ولا تكشف أي بيانات أخرى عن الطالب.
create or replace function public.verify_certificate(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  code text := upper(trim(coalesce(p_code, '')));
  sfx text; cid text; prof record; r jsonb; title text;
begin
  if code !~ '^[0-9A-F]{6}-[A-Z0-9-]{1,40}$' then return null; end if;
  sfx := split_part(code, '-', 1);
  cid := lower(substr(code, 8));
  for prof in
    select name, data from public.profiles
     where kind = 'student' and not disabled and upper(right(id::text, 6)) = sfx
  loop
    r := prof.data->'results'->cid;
    if r is not null and (r->>'total')::numeric > 0 and (r->>'score')::numeric / (r->>'total')::numeric >= 0.6 then
      select coalesce(
        (select p->>'title' from public.site_content s, jsonb_array_elements(coalesce(s.data->'programs','[]'::jsonb)) p where s.id = 1 and lower(p->>'id') = cid limit 1),
        (select c->>'title' from public.site_content s, jsonb_array_elements(coalesce(s.data->'courses','[]'::jsonb)) c where s.id = 1 and lower(c->>'id') = cid limit 1)
      ) into title;
      if title is null then return null; end if;
      return jsonb_build_object(
        'name', prof.name, 'course', title, 'date', r->>'date',
        'percent', round((r->>'score')::numeric * 100 / (r->>'total')::numeric));
    end if;
  end loop;
  return null;
end $$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
