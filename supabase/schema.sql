create table if not exists public.boletas (
  id bigint generated always as identity primary key,
  numero text not null,
  grupo smallint not null check (grupo in (1, 2)),
  contenido_qr text not null unique,
  unique (grupo, numero)
);

create table if not exists public.ingresos (
  boleta_id bigint primary key references public.boletas(id) on delete restrict,
  registrado_en timestamptz not null default now(),
  registrado_por uuid not null references auth.users(id),
  solicitud_id uuid not null unique
);

create table if not exists public.operadores_autorizados (
  usuario_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.boletas enable row level security;
alter table public.ingresos enable row level security;
alter table public.operadores_autorizados enable row level security;

revoke all on table public.boletas from anon, authenticated;
revoke all on table public.ingresos from anon, authenticated;
revoke all on table public.operadores_autorizados from anon, authenticated;

create or replace function public.registrar_ingreso(
  p_contenido_qr text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boleta public.boletas%rowtype;
  v_solicitud_id uuid;
  v_registrado_en timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autorizada'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.operadores_autorizados as o
    where o.usuario_id = auth.uid()
  ) then
    raise exception 'La cuenta no está autorizada para registrar ingresos'
      using errcode = '42501';
  end if;
  if p_request_id is null or p_contenido_qr is null or length(trim(p_contenido_qr)) = 0 then
    raise exception 'Código o identificador de solicitud inválido'
      using errcode = '22023';
  end if;

  select b.* into v_boleta
  from public.boletas as b
  where b.contenido_qr = trim(p_contenido_qr);

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select i.solicitud_id, i.registrado_en
    into v_solicitud_id, v_registrado_en
  from public.ingresos as i
  where i.boleta_id = v_boleta.id;

  if found and v_solicitud_id = p_request_id then
    return jsonb_build_object(
      'status', 'registered',
      'numero', v_boleta.numero,
      'grupo', v_boleta.grupo,
      'checked_in_at', v_registrado_en
    );
  end if;

  insert into public.ingresos (boleta_id, registrado_por, solicitud_id)
  values (v_boleta.id, auth.uid(), p_request_id)
  on conflict (boleta_id) do nothing
  returning registrado_en into v_registrado_en;

  if found then
    return jsonb_build_object(
      'status', 'registered',
      'numero', v_boleta.numero,
      'grupo', v_boleta.grupo,
      'checked_in_at', v_registrado_en
    );
  end if;

  select i.solicitud_id, i.registrado_en
    into v_solicitud_id, v_registrado_en
  from public.ingresos as i
  where i.boleta_id = v_boleta.id;

  return jsonb_build_object(
    'status', case when v_solicitud_id = p_request_id then 'registered' else 'already_registered' end,
    'numero', v_boleta.numero,
    'grupo', v_boleta.grupo,
    'checked_in_at', v_registrado_en
  );
end;
$$;

create or replace function public.resumen_ingresos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autorizada'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.operadores_autorizados as o
    where o.usuario_id = auth.uid()
  ) then
    raise exception 'La cuenta no está autorizada para consultar ingresos'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_boletas', (select count(*) from public.boletas),
    'ingresos_registrados', (select count(*) from public.ingresos)
  );
end;
$$;

revoke all on function public.registrar_ingreso(text, uuid) from public, anon;
revoke all on function public.resumen_ingresos() from public, anon;
grant execute on function public.registrar_ingreso(text, uuid) to authenticated;
grant execute on function public.resumen_ingresos() to authenticated;
