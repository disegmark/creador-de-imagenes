-- Studio iA: almacenamiento en Supabase (STUDIO_STORAGE=supabase)
-- 1) Ejecuta este SQL en el editor SQL de tu proyecto (se puede volver a ejecutar sin problema).
-- 2) El bucket "studio-media" (o el de STUDIO_SUPABASE_BUCKET) debe ser PÚBLICO:
--    Instagram, Facebook y n8n descargan las imágenes por URL.

create table if not exists public.studio_kv (
  key text primary key,
  value jsonb,
  -- Control de concurrencia: cada escritura exige la versión que leyó.
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Para instalaciones anteriores que no tenían la columna.
alter table public.studio_kv add column if not exists version bigint not null default 0;
update public.studio_kv set version = 1 where version = 0;

-- Solo el backend (service role) accede. Sin políticas = nadie más puede leer/escribir.
alter table public.studio_kv enable row level security;

insert into storage.buckets (id, name, public)
values ('studio-media', 'studio-media', true)
on conflict (id) do nothing;
