-- Studio iA: almacenamiento en Supabase (STUDIO_STORAGE=supabase)
-- 1) Ejecuta este SQL en el editor SQL de tu proyecto.
-- 2) Crea un bucket PÚBLICO llamado "studio-media" (o el nombre de STUDIO_SUPABASE_BUCKET):
--    Instagram, Facebook y n8n necesitan descargar las imágenes por URL.

create table if not exists public.studio_kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- Solo el backend (service role) accede. Sin políticas = nadie más puede leer/escribir.
alter table public.studio_kv enable row level security;

insert into storage.buckets (id, name, public)
values ('studio-media', 'studio-media', true)
on conflict (id) do nothing;
