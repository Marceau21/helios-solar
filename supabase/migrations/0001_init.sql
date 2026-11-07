-- ============================================================
-- Helios — schéma initial
-- Multi-tenant : chaque installateur (company) voit ses clients ;
-- chaque particulier voit uniquement ses installations.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Types ----------
create type user_role as enum ('installer_admin', 'installer_staff', 'homeowner');
create type vendor as enum ('solaredge', 'enphase', 'sungrow', 'sma', 'demo');
create type device_kind as enum ('inverter', 'battery', 'meter', 'gateway');
create type data_freshness as enum ('live', 'recent', 'stale', 'offline');

-- ---------- Entreprises (installateurs) ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  country text not null default 'AU',
  created_at timestamptz not null default now()
);

-- ---------- Profils utilisateurs (liés à auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  company_id uuid references companies(id) on delete set null,
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------- Clients d'un installateur ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- compte particulier lié
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create index on customers(company_id);

-- ---------- Installations ----------
create table installations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null default 'Installation principale',
  address text not null,
  latitude double precision,
  longitude double precision,
  timezone text not null default 'Australia/Sydney',
  system_size_kw numeric(6,2),
  tariff_import_per_kwh numeric(6,4) default 0.32, -- AUD/kWh
  tariff_export_per_kwh numeric(6,4) default 0.05, -- feed-in tariff
  commissioned_on date,
  -- Modèle 3D : segments de toit (Google Solar API ou corrigés), panneaux placés
  building_model jsonb,        -- { source, footprint, roofSegments[] , wallHeight }
  panel_layout jsonb,          -- { panelWidth, panelHeight, panels[] }
  model_source text check (model_source in ('google_solar','manual','demo')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on installations(company_id);
create index on installations(customer_id);

-- ---------- Comptes fabricants (identifiants chiffrés) ----------
create table vendor_connections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references installations(id) on delete cascade,
  vendor vendor not null,
  external_site_id text not null,           -- siteId SolarEdge / system_id Enphase
  credentials_encrypted text,               -- AES-256-GCM, jamais renvoyé au client
  token_expires_at timestamptz,
  customer_consent_at timestamptz,          -- consentement explicite du particulier
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (vendor, external_site_id)
);

-- ---------- Équipements ----------
create table devices (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references installations(id) on delete cascade,
  kind device_kind not null,
  vendor vendor not null,
  model text,
  serial_number text,
  capacity_kwh numeric(6,2),   -- batteries
  rated_power_kw numeric(6,2), -- onduleurs
  created_at timestamptz not null default now()
);

-- ---------- Mesures instantanées normalisées ----------
-- Une ligne = un instantané de puissance (W) de l'installation.
-- Toutes les valeurs sont en Watts ; null = non mesuré par le matériel.
create table power_snapshots (
  installation_id uuid not null references installations(id) on delete cascade,
  measured_at timestamptz not null,
  source vendor not null,
  production_w integer,
  consumption_w integer,
  grid_import_w integer,
  grid_export_w integer,
  battery_charge_w integer,
  battery_discharge_w integer,
  battery_soc_pct numeric(5,2),
  received_at timestamptz not null default now(),
  primary key (installation_id, measured_at)
);

-- ---------- Énergie journalière (kWh) ----------
create table energy_daily (
  installation_id uuid not null references installations(id) on delete cascade,
  day date not null,
  source vendor not null,
  produced_kwh numeric(10,3),
  consumed_kwh numeric(10,3),
  imported_kwh numeric(10,3),
  exported_kwh numeric(10,3),
  self_consumed_kwh numeric(10,3),
  primary key (installation_id, day)
);

-- ---------- Alertes ----------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references installations(id) on delete cascade,
  severity text not null check (severity in ('info','warning','critical')),
  code text not null,
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table companies enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table installations enable row level security;
alter table vendor_connections enable row level security;
alter table devices enable row level security;
alter table power_snapshots enable row level security;
alter table energy_daily enable row level security;
alter table alerts enable row level security;

create or replace function my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function can_see_installation(inst uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from installations i
    join customers c on c.id = i.customer_id
    where i.id = inst
      and (i.company_id = my_company_id() or c.user_id = auth.uid())
  )
$$;

create policy "profil perso" on profiles for select using (id = auth.uid());
create policy "mon entreprise" on companies for select using (id = my_company_id());

create policy "installateur: clients" on customers for all
  using (company_id = my_company_id()) with check (company_id = my_company_id());
create policy "particulier: sa fiche" on customers for select using (user_id = auth.uid());

create policy "installateur: installations" on installations for all
  using (company_id = my_company_id()) with check (company_id = my_company_id());
create policy "particulier: ses installations" on installations for select
  using (can_see_installation(id));

-- Les identifiants fabricants ne sont lisibles QUE par le service role (serveur).
create policy "installateur: connexions (sans secrets via vue)" on vendor_connections for select
  using (exists (select 1 from installations i where i.id = installation_id and i.company_id = my_company_id()));
revoke select (credentials_encrypted) on vendor_connections from authenticated, anon;

create policy "lecture équipements" on devices for select using (can_see_installation(installation_id));
create policy "installateur: équipements" on devices for all
  using (exists (select 1 from installations i where i.id = installation_id and i.company_id = my_company_id()));
create policy "lecture mesures" on power_snapshots for select using (can_see_installation(installation_id));
create policy "lecture énergie" on energy_daily for select using (can_see_installation(installation_id));
create policy "lecture alertes" on alerts for select using (can_see_installation(installation_id));

-- Vue pratique : dernier instantané par installation
create view latest_snapshot with (security_invoker = true) as
select distinct on (installation_id) *
from power_snapshots
order by installation_id, measured_at desc;
