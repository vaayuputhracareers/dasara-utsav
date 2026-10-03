-- =====================================================================
--  DASARA UTSAV APP — Supabase database setup
--  ---------------------------------------------------------------------
--  HOW TO USE:  Supabase Dashboard → SQL Editor → "New query" →
--               paste this WHOLE file → click "Run".
--  Safe to run again later (it only adds what is missing / updates logic).
--
--  What it creates:
--    • profiles        – admin & team members (login = mobile number + 6-digit PIN)
--    • member_invites  – accounts the admin is creating
--    • app_settings    – ALL editable names/settings (temple, committee…)
--    • donations       – every receipt, stamped with the collector
--    • expenses        – with approval flow + bill photo
--    • handovers       – day-end cash handed to admin
--    • festival_days / programs – schedule & alankaram
--    • pujas           – puja schedule: which family does the puja on which day
--    • cash_transfers  – opening balance + cash deposited into / withdrawn from the bank
--    • audit_log       – history of every important change
--    • storage buckets – 'bills' (private) and 'assets' (logo + splash picture, public)
--  Security: Row Level Security is ON for every table.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null default '',
  name_te      text not null default '',              -- Telugu name (used on receipts)
  mobile       text unique,                           -- login id (10 digits)
  role         text not null default 'member' check (role in ('admin','member')),
  status       text not null default 'pending' check (status in ('pending','active','blocked')),
  created_at   timestamptz not null default now(),
  approved_by  uuid,
  approved_at  timestamptz
);

create table if not exists public.member_invites (
  mobile      text primary key check (mobile ~ '^[0-9]{10}$'),
  full_name   text not null default '',
  name_te     text not null default '',
  role        text not null default 'member' check (role in ('admin','member')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.app_settings (
  id                   int primary key default 1 check (id = 1),
  temple_name_te       text not null default '',
  temple_name_en       text not null default '',
  committee_name_te    text not null default 'దసరా ఉత్సవ కమిటీ',
  committee_name_en    text not null default 'Dasara Utsav Committee',
  village_te           text not null default '',
  village_en           text not null default '',
  address_te           text not null default '',
  address_en           text not null default '',
  event_title_te       text not null default 'దసరా శరన్నవరాత్రి మహోత్సవాలు',
  event_title_en       text not null default 'Dasara Sharannavaratri Mahotsavalu',
  event_year           int  not null default 2026,
  start_date           date default '2026-10-11',
  end_date             date default '2026-10-20',
  receipt_prefix       text not null default 'DSR26',
  contact_phone        text not null default '',
  upi_id               text not null default '',
  upi_payee_name       text not null default '',
  logo_url             text not null default '',
  public_base_url      text not null default '',
  quick_amounts        int[] not null default '{116,216,516,1116,2116,5116}',
  purposes             jsonb not null default
    '[{"te":"సాధారణ విరాళం","en":"General donation"},
      {"te":"అన్నదానం","en":"Annadanam"},
      {"te":"అమ్మవారి అలంకరణ","en":"Ammavari Alankarana"},
      {"te":"కుంకుమ పూజ","en":"Kumkuma Pooja"},
      {"te":"ఇతర","en":"Other"}]'::jsonb,
  expense_categories   jsonb not null default
    '[{"te":"పందిరి & టెంట్","en":"Pandal & Tent"},
      {"te":"లైటింగ్ & సౌండ్","en":"Lighting & Sound"},
      {"te":"పూలు & అలంకరణ","en":"Flowers & Decoration"},
      {"te":"పూజా సామగ్రి","en":"Pooja Items"},
      {"te":"ప్రసాదం / అన్నదానం","en":"Prasadam / Annadanam"},
      {"te":"పూజారి దక్షిణ","en":"Priest Dakshina"},
      {"te":"సాంస్కృతిక కార్యక్రమాలు","en":"Cultural Programs"},
      {"te":"ప్రింటింగ్ & బ్యానర్లు","en":"Printing & Banners"},
      {"te":"రవాణా","en":"Transport"},
      {"te":"ఇతర ఖర్చులు","en":"Miscellaneous"}]'::jsonb,
  receipt_template     text not null default $tpl$🙏 {temple} {event} – {year} 🙏

{donor} గారికి నమస్కారం,
మీరు అందించిన ₹{amount} విరాళాన్ని కృతజ్ఞతతో స్వీకరించాము.

🧾 రసీదు సంఖ్య: {receipt_no}
📅 తేదీ: {date}
💵 చెల్లింపు: {mode}
🪔 ఉద్దేశం: {purpose}
👤 స్వీకరించిన వారు: {collector}
🔗 రసీదు చూడండి: {link}

అమ్మవారి అనుగ్రహం మీ కుటుంబంపై సదా ఉండాలని ప్రార్థిస్తున్నాము.
– {committee}, {village}$tpl$,
  allow_self_signup    boolean not null default true,
  public_enabled       boolean not null default false,
  public_slug          text not null default encode(extensions.gen_random_bytes(5), 'hex'),
  show_programs        boolean not null default true,
  show_donation_total  boolean not null default true,
  show_donor_list      boolean not null default false,
  show_donor_amounts   boolean not null default false,
  show_expense_summary boolean not null default false,
  show_expense_details boolean not null default false,
  show_net_position    boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- Added in version 4 – splash screen: a full-screen picture shown for a few seconds when the app opens.
alter table public.app_settings add column if not exists splash_url text not null default '';
alter table public.app_settings add column if not exists splash_seconds int not null default 5
  check (splash_seconds between 1 and 10);
alter table public.app_settings alter column splash_seconds set default 5;
-- Added in version 5 – puja schedule on the public page (Public page → "What can visitors see?").
alter table public.app_settings add column if not exists show_pujas boolean not null default true;
-- Added in version 6 – "Donate" button on the public page (pays the temple UPI ID above) and the QR poster editor.
alter table public.app_settings add column if not exists show_donate boolean not null default true;
alter table public.app_settings add column if not exists qr_poster jsonb not null default '{}'::jsonb
  check (jsonb_typeof(qr_poster) = 'object');
-- Added in version 7 – team members may see the committee's financial position (Members page switch).
alter table public.app_settings add column if not exists members_see_finance boolean not null default false;
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.handovers (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.profiles(id),
  expected_amount  numeric(12,2) not null,
  amount_received  numeric(12,2) not null,
  note             text,
  received_by      uuid not null references public.profiles(id),
  received_at      timestamptz not null default now()
);

-- gap-free receipt counter (a failed save never wastes a number)
create table if not exists public.receipt_counter (
  id       int primary key default 1 check (id = 1),
  last_no  bigint not null default 0
);
insert into public.receipt_counter (id, last_no) values (1, 0) on conflict (id) do nothing;

create table if not exists public.donations (
  id               uuid primary key default gen_random_uuid(),
  receipt_seq      bigint,
  receipt_no       text unique,
  donor_name       text not null check (length(btrim(donor_name)) > 0),
  mobile           text check (mobile is null or mobile ~ '^[0-9]{10}$'),
  amount           numeric(12,2) not null check (amount > 0),
  payment_mode     text not null check (payment_mode in ('cash','upi')),
  upi_ref          text,
  village          text,
  gotram           text,
  purpose_te       text,
  purpose_en       text,
  notes            text,
  collected_by     uuid not null references public.profiles(id),
  collected_at     timestamptz not null default now(),
  verify_token     text unique,
  shared_at        timestamptz,
  status           text not null default 'active' check (status in ('active','cancelled')),
  cancel_reason    text,
  cancelled_by     uuid references public.profiles(id),
  cancelled_at     timestamptz,
  upi_verified     boolean not null default false,
  upi_verified_by  uuid references public.profiles(id),
  upi_verified_at  timestamptz,
  handover_id      uuid references public.handovers(id),
  updated_at       timestamptz not null default now()
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  category_te   text,
  category_en   text,
  description   text,
  paid_to       text,
  amount        numeric(12,2) not null check (amount > 0),
  payment_mode  text not null default 'cash' check (payment_mode in ('cash','upi')),
  paid_by       uuid references public.profiles(id),   -- member who spent from collected cash (null = committee funds)
  bill_path     text,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  review_note   text,
  handover_id   uuid references public.handovers(id),
  updated_at    timestamptz not null default now()
);

-- Added in version 7 – a member's expense is settled in one of 2 ways:
--   set off against the cash the member collects (settled_mode empty – as before), or
--   paid back by the admin in cash or through the temple UPI (settled_mode 'cash' / 'upi').
-- Changed only through settle_expense() (checked + written to the change history).
alter table public.expenses add column if not exists settled_mode text check (settled_mode in ('cash','upi'));
alter table public.expenses add column if not exists settled_at   timestamptz;
alter table public.expenses add column if not exists settled_by   uuid references public.profiles(id);
alter table public.expenses add column if not exists settled_ref  text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_settled_member_chk') then
    alter table public.expenses add constraint expenses_settled_member_chk
      check (settled_mode is null or (paid_by is not null and status = 'approved'));
  end if;
end $$;

create table if not exists public.festival_days (
  day_date      date primary key,
  alankaram_te  text not null default '',
  alankaram_en  text not null default '',
  note_te       text not null default '',
  note_en       text not null default ''
);

create table if not exists public.programs (
  id            uuid primary key default gen_random_uuid(),
  program_date  date not null,
  start_time    time,
  end_time      time,
  title_te      text not null default '',
  title_en      text not null default '',
  place         text not null default '',
  details       text not null default '',
  created_at    timestamptz not null default now()
);

-- Added in version 5 – puja schedule: which family does the puja on which festival day.
-- Mobile, gotram and note are for the team only (never on the public page).
create table if not exists public.pujas (
  id           uuid primary key default gen_random_uuid(),
  puja_date    date not null,
  puja_time    time,
  puja_name    text not null default '',
  family_name  text not null default '',          -- empty = the date is still free
  village      text not null default '',
  gotram       text not null default '',
  mobile       text check (mobile is null or mobile ~ '^[0-9]{10}$'),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Added in version 6 – Telugu names in the program and puja schedules (shown when the app / page is in Telugu).
-- The older columns (place, details, puja_name, family_name, village, gotram) hold the English names.
alter table public.programs add column if not exists place_te       text not null default '';
alter table public.programs add column if not exists details_te     text not null default '';
alter table public.pujas    add column if not exists puja_name_te   text not null default '';
alter table public.pujas    add column if not exists family_name_te text not null default '';   -- a family in either language = reserved
alter table public.pujas    add column if not exists village_te     text not null default '';
alter table public.pujas    add column if not exists gotram_te      text not null default '';   -- team only, like gotram

-- Added in version 8 – cash moved between "cash in hand" and the bank, so both balances stay right:
--   deposit      = cash deposited into the bank   (cash in hand ↓, cash at bank ↑)
--   withdrawal   = cash withdrawn from the bank   (cash at bank ↓, cash in hand ↑)
-- Version 9 – the opening balance (money the committee already had, e.g. last year's balance):
--   opening_cash = opening cash in hand, opening_bank = opening cash at bank (at most one of each)
create table if not exists public.cash_transfers (
  id             uuid primary key default gen_random_uuid(),
  transfer_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  kind           text not null check (kind in ('deposit', 'withdrawal', 'opening_cash', 'opening_bank')),
  amount         numeric(12,2) not null check (amount > 0),
  note           text not null default '',
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- version 9 upgrade (a database that already ran version 8): allow the two opening-balance kinds
alter table public.cash_transfers drop constraint if exists cash_transfers_kind_check;
alter table public.cash_transfers add constraint cash_transfers_kind_check
  check (kind in ('deposit', 'withdrawal', 'opening_cash', 'opening_bank'));

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb
);

create index if not exists donations_collected_by_idx on public.donations (collected_by);
create index if not exists donations_collected_at_idx on public.donations (collected_at desc);
create index if not exists donations_handover_idx     on public.donations (handover_id);
create index if not exists expenses_status_idx        on public.expenses (status);
create index if not exists expenses_created_by_idx    on public.expenses (created_by);
create index if not exists expenses_paid_by_idx       on public.expenses (paid_by);
create index if not exists programs_date_idx          on public.programs (program_date, start_time);
create index if not exists pujas_date_idx             on public.pujas (puja_date, puja_time);
create index if not exists handovers_member_idx       on public.handovers (member_id);
create index if not exists cash_transfers_date_idx    on public.cash_transfers (transfer_date);
create unique index if not exists cash_transfers_opening_once on public.cash_transfers (kind)
  where kind in ('opening_cash', 'opening_bank');
create index if not exists audit_at_idx               on public.audit_log (at desc);

-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'active');
$$;

create or replace function public.normalize_mobile(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := right(d, 10); end if;
  if d = '' then return null; end if;
  return d;
end $$;

create or replace function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
$$;

-- Running cash account of every user:
-- balance = cash donations (active) − approved expenses they paid − cash already handed over
create or replace function public.member_balances_internal()
returns table (member_id uuid, full_name text, name_te text, mobile text, role text, status text,
               cash_collected numeric, cash_count bigint, expenses_approved numeric,
               handed_over numeric, balance numeric, unsettled_count bigint, unsettled_amount numeric,
               last_handover_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.name_te, p.mobile, p.role, p.status,
         coalesce(c.s, 0), coalesce(c.n, 0), coalesce(x.s, 0), coalesce(h.s, 0),
         coalesce(c.s, 0) - coalesce(x.s, 0) - coalesce(h.s, 0),
         coalesce(u.n, 0), coalesce(u.s, 0), h.last_at
  from public.profiles p
  left join (select collected_by as id, sum(amount) s, count(*) n from public.donations
             where status = 'active' and payment_mode = 'cash' group by 1) c on c.id = p.id
  left join (select paid_by as id, sum(amount) s from public.expenses   -- set off only (paid-back expenses are not deducted)
             where status = 'approved' and paid_by is not null and settled_mode is null group by 1) x on x.id = p.id
  left join (select member_id as id, sum(amount_received) s, max(received_at) last_at
             from public.handovers group by 1) h on h.id = p.id
  left join (select collected_by as id, count(*) n, sum(amount) s from public.donations
             where status = 'active' and payment_mode = 'cash' and handover_id is null group by 1) u on u.id = p.id;
$$;

-- Versions 8–9 – where the money is (admin dashboard + members' financial position):
--   cash at bank   = opening bank + UPI donations − committee expenses paid by UPI − pay backs by temple UPI
--                    + deposits − withdrawals
--   cash in hand   = with the committee + still with members, where
--   with committee = opening cash + cash admins collected + cash handed over − committee expenses paid in cash
--                    − pay backs in cash − deposits + withdrawals
--   net position   = opening balance + donations − approved expenses
--                  = cash in hand + cash at bank − what the committee owes members
create or replace function public.cash_position_internal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cash_don numeric; v_upi_don numeric; v_exp numeric;
  v_open_cash numeric; v_open_bank numeric; v_dep numeric; v_wd numeric; v_tr bigint;
  v_cexp numeric; v_uexp numeric; v_setoff numeric; v_pbc numeric; v_pbu numeric; v_ho numeric;
  v_admin numeric; v_members numeric; v_owed numeric; v_committee numeric; v_bank numeric;
begin
  select coalesce(sum(amount) filter (where payment_mode = 'cash'), 0), coalesce(sum(amount) filter (where payment_mode = 'upi'), 0)
    into v_cash_don, v_upi_don from public.donations where status = 'active';
  select coalesce(sum(amount) filter (where kind = 'opening_cash'), 0), coalesce(sum(amount) filter (where kind = 'opening_bank'), 0),
         coalesce(sum(amount) filter (where kind = 'deposit'), 0), coalesce(sum(amount) filter (where kind = 'withdrawal'), 0),
         count(*) filter (where kind in ('deposit', 'withdrawal'))
    into v_open_cash, v_open_bank, v_dep, v_wd, v_tr from public.cash_transfers;
  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where paid_by is null and payment_mode = 'cash'), 0),
         coalesce(sum(amount) filter (where paid_by is null and payment_mode = 'upi'), 0),
         coalesce(sum(amount) filter (where paid_by is not null and settled_mode is null), 0),
         coalesce(sum(amount) filter (where settled_mode = 'cash'), 0),
         coalesce(sum(amount) filter (where settled_mode = 'upi'), 0)
    into v_exp, v_cexp, v_uexp, v_setoff, v_pbc, v_pbu from public.expenses where status = 'approved';
  select coalesce(sum(amount_received), 0) into v_ho from public.handovers;
  select coalesce(sum(balance) filter (where role = 'admin'), 0),
         coalesce(sum(balance) filter (where role <> 'admin' and balance > 0), 0),
         coalesce(-sum(balance) filter (where role <> 'admin' and balance < 0), 0)
    into v_admin, v_members, v_owed from public.member_balances_internal();
  v_committee := v_open_cash + v_admin + v_ho - v_cexp - v_pbc - v_dep + v_wd;
  v_bank := v_open_bank + v_upi_don - v_uexp - v_pbu + v_dep - v_wd;
  return jsonb_build_object(
    'opening_cash',        v_open_cash,
    'opening_bank',        v_open_bank,
    'net_position',        v_open_cash + v_open_bank + v_cash_don + v_upi_don - v_exp,
    'cash_in_hand',        v_committee + v_members,
    'cash_with_committee', v_committee,
    'cash_with_members',   v_members,
    'owed_to_members',     v_owed,
    'bank_balance',        v_bank,
    'committee_cash_exp',  v_cexp,
    'committee_upi_exp',   v_uexp,
    'member_exp_setoff',   v_setoff,
    'paid_back_cash',      v_pbc,
    'paid_back_upi',       v_pbu,
    'handed_over_total',   v_ho,
    'deposits_total',      v_dep,
    'withdrawals_total',   v_wd,
    'transfers_count',     v_tr);
end $$;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- 3a. New login account → profile row
--     (shared logic, used by the auth trigger AND by ensure_my_profile() as a fallback)
create or replace function public.create_profile_internal(p_id uuid, p_email text, p_meta jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mobile text;
  v_has_admin boolean;
  v_inv public.member_invites%rowtype;
  v_allow boolean;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_id is null or exists (select 1 from public.profiles where id = p_id) then return; end if;
  v_mobile := public.normalize_mobile(split_part(coalesce(p_email, ''), '@', 1));
  if v_mobile is not null and v_mobile !~ '^[0-9]{10}$' then v_mobile := null; end if;

  select exists (select 1 from public.profiles where role = 'admin') into v_has_admin;
  select * into v_inv from public.member_invites where mobile = v_mobile;

  if found then
    -- account created by an admin → active immediately
    insert into public.profiles (id, full_name, name_te, mobile, role, status, approved_by, approved_at)
    values (p_id, coalesce(nullif(v_inv.full_name, ''), v_meta->>'full_name', ''),
            coalesce(v_inv.name_te, ''), v_mobile, v_inv.role, 'active', v_inv.created_by, now())
    on conflict (id) do nothing;
    delete from public.member_invites where mobile = v_mobile;
  elsif not v_has_admin then
    -- very first account becomes the ADMIN
    insert into public.profiles (id, full_name, name_te, mobile, role, status, approved_at)
    values (p_id, coalesce(v_meta->>'full_name', ''), coalesce(v_meta->>'name_te', ''), v_mobile, 'admin', 'active', now())
    on conflict (id) do nothing;
  else
    select allow_self_signup into v_allow from public.app_settings where id = 1;
    if not coalesce(v_allow, false) then
      raise exception 'signup_closed';
    end if;
    insert into public.profiles (id, full_name, name_te, mobile, role, status)
    values (p_id, coalesce(v_meta->>'full_name', ''), coalesce(v_meta->>'name_te', ''), v_mobile, 'member', 'pending')
    on conflict (id) do nothing;
  end if;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.create_profile_internal(new.id, new.email, new.raw_user_meta_data);
  return new;
end $$;

-- Called by the app right after login/sign-up (safety net if the trigger is missing)
create or replace function public.ensure_my_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_allowed'; end if;
  perform public.create_profile_internal(v_uid, auth.jwt() ->> 'email', coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb));
  return (select to_jsonb(p) from public.profiles p where p.id = v_uid);
end $$;

-- create the trigger only if it is not there yet (re-running this script never drops it)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
exception when insufficient_privilege then
  raise notice 'Trigger on auth.users not allowed here (%) – the app will create profiles via ensure_my_profile().', sqlerrm;
end $$;

-- 3b. Profile safety rules
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.mobile := old.mobile;   -- login id never changes
  if auth.uid() is not null and new.id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'cannot_change_own_role';
  end if;
  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active') then
    if not exists (select 1 from public.profiles
                   where role = 'admin' and status = 'active' and id <> old.id) then
      raise exception 'last_admin';
    end if;
  end if;
  if old.status = 'pending' and new.status = 'active' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    perform public.write_audit('member_changed', 'profile', new.id::text,
      jsonb_build_object('name', new.full_name, 'role', jsonb_build_array(old.role, new.role),
                         'status', jsonb_build_array(old.status, new.status)));
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- puja schedule: remember when an entry was last changed (Export → "changed after the last export")
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pujas_touch on public.pujas;
create trigger pujas_touch before update on public.pujas
  for each row execute function public.touch_updated_at();

-- 3c. Donation: receipt number, token, collector are set by the server
create or replace function public.donations_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_prefix text; v_no bigint;
begin
  if auth.uid() is not null then
    if not public.is_active_user() then raise exception 'not_allowed'; end if;
    new.collected_by := auth.uid();
  end if;
  -- validate first, so a rejected entry never uses up a receipt number
  if new.donor_name is null or btrim(new.donor_name) = '' then raise exception 'donor_name_required'; end if;
  if new.amount is null or new.amount <= 0 then raise exception 'invalid_amount'; end if;
  if new.payment_mode is null or new.payment_mode not in ('cash', 'upi') then raise exception 'invalid_mode'; end if;
  new.mobile := public.normalize_mobile(new.mobile);
  if new.mobile is not null and new.mobile !~ '^[0-9]{10}$' then raise exception 'invalid_mobile'; end if;
  new.donor_name := btrim(new.donor_name);

  select coalesce(nullif(btrim(receipt_prefix), ''), 'RCPT') into v_prefix
    from public.app_settings where id = 1;
  update public.receipt_counter set last_no = last_no + 1 where id = 1 returning last_no into v_no;
  if v_no is null then
    insert into public.receipt_counter (id, last_no) values (1, 1)
    on conflict (id) do update set last_no = public.receipt_counter.last_no + 1
    returning last_no into v_no;
  end if;
  new.receipt_seq     := v_no;
  new.receipt_no      := coalesce(v_prefix, 'RCPT') || '-' || lpad(v_no::text, 4, '0');
  new.verify_token    := encode(extensions.gen_random_bytes(6), 'hex');
  new.collected_at    := now();
  new.status          := 'active';
  new.shared_at       := null;
  new.cancel_reason   := null; new.cancelled_by := null; new.cancelled_at := null;
  new.upi_verified    := false; new.upi_verified_by := null; new.upi_verified_at := null;
  new.handover_id     := null;
  new.updated_at      := now();
  return new;
end $$;

drop trigger if exists donations_before_insert on public.donations;
create trigger donations_before_insert before insert on public.donations
  for each row execute function public.donations_before_insert();

create or replace function public.donations_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- these never change
  new.receipt_seq  := old.receipt_seq;
  new.receipt_no   := old.receipt_no;
  new.verify_token := old.verify_token;
  new.collected_by := old.collected_by;
  new.collected_at := old.collected_at;
  new.mobile       := public.normalize_mobile(new.mobile);
  new.updated_at   := now();
  if new.status is distinct from old.status
     or new.amount is distinct from old.amount
     or new.payment_mode is distinct from old.payment_mode
     or new.donor_name is distinct from old.donor_name
     or new.mobile is distinct from old.mobile then
    perform public.write_audit(
      case when new.status = 'cancelled' and old.status <> 'cancelled' then 'donation_cancelled' else 'donation_edited' end,
      'donation', old.receipt_no,
      jsonb_build_object(
        'amount', jsonb_build_array(old.amount, new.amount),
        'mode', jsonb_build_array(old.payment_mode, new.payment_mode),
        'donor', jsonb_build_array(old.donor_name, new.donor_name),
        'mobile', jsonb_build_array(old.mobile, new.mobile),
        'status', jsonb_build_array(old.status, new.status),
        'reason', new.cancel_reason));
  end if;
  return new;
end $$;

drop trigger if exists donations_before_update on public.donations;
create trigger donations_before_update before update on public.donations
  for each row execute function public.donations_before_update();

-- 3d. Expense: admin entries are approved, member entries wait for approval
create or replace function public.expenses_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  new.created_at  := now();
  new.updated_at  := now();
  new.handover_id := null;
  new.settled_mode := null; new.settled_at := null; new.settled_by := null; new.settled_ref := null;   -- pay back: settle_expense()
  if public.is_admin() then
    new.status      := 'approved';
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.status      := 'pending';
    new.paid_by     := new.created_by;   -- spent from the member's collected cash
    new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  end if;
  return new;
end $$;

drop trigger if exists expenses_before_insert on public.expenses;
create trigger expenses_before_insert before insert on public.expenses
  for each row execute function public.expenses_before_insert();

create or replace function public.expenses_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- version 7: the settlement changes only through settle_expense(); a paid-back expense keeps its amount and member
  if (new.settled_mode is distinct from old.settled_mode or new.settled_at is distinct from old.settled_at
      or new.settled_by is distinct from old.settled_by or new.settled_ref is distinct from old.settled_ref)
     and coalesce(current_setting('app.settle_expense', true), '') <> 'on' then
    raise exception 'use_settle_expense';
  end if;
  if old.settled_mode is not null and new.settled_mode is not null
     and (new.amount is distinct from old.amount or new.paid_by is distinct from old.paid_by) then
    raise exception 'paid_back_locked';
  end if;
  if new.status is distinct from old.status or new.amount is distinct from old.amount then
    perform public.write_audit('expense_' || new.status, 'expense', old.id::text,
      jsonb_build_object('amount', jsonb_build_array(old.amount, new.amount),
                         'status', jsonb_build_array(old.status, new.status),
                         'category', new.category_en, 'note', new.review_note));
  end if;
  return new;
end $$;

drop trigger if exists expenses_before_update on public.expenses;
create trigger expenses_before_update before update on public.expenses
  for each row execute function public.expenses_before_update();

-- 3e. Settings timestamp + audit
create or replace function public.settings_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists settings_before_update on public.app_settings;
create trigger settings_before_update before update on public.app_settings
  for each row execute function public.settings_before_update();

-- 3f. Cash ⇄ bank entries (version 8): who wrote them + change history
create or replace function public.cash_transfers_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.write_audit('transfer_deleted', 'transfer', old.id::text,
      jsonb_build_object('kind', old.kind, 'amount', old.amount, 'date', old.transfer_date, 'note', nullif(old.note, '')));
    return old;
  end if;
  new.note := btrim(coalesce(new.note, ''));
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    perform public.write_audit('transfer_added', 'transfer', new.id::text,
      jsonb_build_object('kind', new.kind, 'amount', new.amount, 'date', new.transfer_date, 'note', nullif(new.note, '')));
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if (new.kind, new.amount, new.transfer_date, new.note) is distinct from (old.kind, old.amount, old.transfer_date, old.note) then
      perform public.write_audit('transfer_changed', 'transfer', old.id::text,
        jsonb_build_object('kind', jsonb_build_array(old.kind, new.kind), 'amount', jsonb_build_array(old.amount, new.amount),
                           'date', jsonb_build_array(old.transfer_date, new.transfer_date), 'note', nullif(new.note, '')));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cash_transfers_write on public.cash_transfers;
create trigger cash_transfers_write before insert or update or delete on public.cash_transfers
  for each row execute function public.cash_transfers_write();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (who can see / change what)
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.member_invites enable row level security;
alter table public.app_settings   enable row level security;
alter table public.handovers      enable row level security;
alter table public.donations      enable row level security;
alter table public.expenses       enable row level security;
alter table public.festival_days  enable row level security;
alter table public.programs       enable row level security;
alter table public.pujas          enable row level security;
alter table public.cash_transfers enable row level security;
alter table public.audit_log      enable row level security;
alter table public.receipt_counter enable row level security;   -- no policies: only server functions touch it

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- member_invites (admin only)
drop policy if exists invites_admin on public.member_invites;
create policy invites_admin on public.member_invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- app_settings
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_active_user());
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- donations
drop policy if exists donations_select on public.donations;
create policy donations_select on public.donations for select to authenticated
  using (collected_by = auth.uid() or public.is_admin());
drop policy if exists donations_insert on public.donations;
create policy donations_insert on public.donations for insert to authenticated
  with check (public.is_active_user() and collected_by = auth.uid());
drop policy if exists donations_update on public.donations;
create policy donations_update on public.donations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- expenses
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or public.is_admin());
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- handovers (written only through confirm_handover)
drop policy if exists handovers_select on public.handovers;
create policy handovers_select on public.handovers for select to authenticated
  using (member_id = auth.uid() or public.is_admin());

-- festival days & programs
drop policy if exists days_select on public.festival_days;
create policy days_select on public.festival_days for select to authenticated
  using (public.is_active_user());
drop policy if exists days_write on public.festival_days;
create policy days_write on public.festival_days for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated
  using (public.is_active_user());
drop policy if exists programs_write on public.programs;
create policy programs_write on public.programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- puja schedule: every team member can see it, only the admin writes it
drop policy if exists pujas_select on public.pujas;
create policy pujas_select on public.pujas for select to authenticated
  using (public.is_active_user());
drop policy if exists pujas_write on public.pujas;
create policy pujas_write on public.pujas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cash ⇄ bank entries (version 8): admin only
drop policy if exists transfers_admin on public.cash_transfers;
create policy transfers_admin on public.cash_transfers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit log (admin read only)
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- table privileges (RLS above decides the rows)
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.member_invites, public.app_settings,
  public.handovers, public.donations, public.expenses, public.festival_days, public.programs,
  public.pujas, public.cash_transfers, public.audit_log to authenticated;

-- ---------------------------------------------------------------------
-- 5. FUNCTIONS CALLED BY THE APP
-- ---------------------------------------------------------------------

-- Public branding (login screen, public page, receipt page)
create or replace function public.get_branding() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'temple_name_te', temple_name_te, 'temple_name_en', temple_name_en,
    'committee_name_te', committee_name_te, 'committee_name_en', committee_name_en,
    'village_te', village_te, 'village_en', village_en,
    'address_te', address_te, 'address_en', address_en,
    'event_title_te', event_title_te, 'event_title_en', event_title_en,
    'event_year', event_year, 'start_date', start_date, 'end_date', end_date,
    'logo_url', logo_url, 'contact_phone', contact_phone,
    'splash_url', splash_url, 'splash_seconds', splash_seconds,
    'allow_self_signup', allow_self_signup)
  from public.app_settings where id = 1;
$$;

-- Public QR page: returns ONLY the sections the admin switched on. Never mobile numbers.
create or replace function public.get_public_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.app_settings%rowtype;
  r jsonb;
  v_don numeric; v_cnt bigint; v_exp numeric;
begin
  select * into s from public.app_settings where id = 1;
  if not found or not s.public_enabled or p_slug is distinct from s.public_slug then
    return jsonb_build_object('enabled', false);
  end if;

  select coalesce(sum(amount), 0), count(*) into v_don, v_cnt from public.donations where status = 'active';
  select coalesce(sum(amount), 0) into v_exp from public.expenses where status = 'approved';

  r := jsonb_build_object('enabled', true, 'branding', public.get_branding(),
         'sections', jsonb_build_object(
            'programs', s.show_programs, 'donation_total', s.show_donation_total,
            'donor_list', s.show_donor_list, 'donor_amounts', s.show_donor_amounts,
            'expense_summary', s.show_expense_summary, 'expense_details', s.show_expense_details,
            'net_position', s.show_net_position, 'pujas', s.show_pujas,
            'donate', s.show_donate and s.upi_id <> ''));

  if s.show_programs then
    r := r || jsonb_build_object(
      'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day_date) from public.festival_days d), '[]'::jsonb),
      'programs', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'program_date', p.program_date, 'start_time', p.start_time, 'end_time', p.end_time,
          'title_te', p.title_te, 'title_en', p.title_en, 'place', p.place, 'details', p.details,
          'place_te', p.place_te, 'details_te', p.details_te)
          order by p.program_date, p.start_time nulls last) from public.programs p), '[]'::jsonb));
  end if;
  if s.show_pujas then   -- date, puja, family and village only: never mobile, gotram or note
    r := r || jsonb_build_object(
      'pujas', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'puja_date', p.puja_date, 'puja_time', p.puja_time, 'puja_name', p.puja_name,
          'family_name', p.family_name, 'village', p.village,
          'puja_name_te', p.puja_name_te, 'family_name_te', p.family_name_te, 'village_te', p.village_te)
          order by p.puja_date, p.puja_time nulls last, p.created_at) from public.pujas p), '[]'::jsonb));
  end if;
  if s.show_donate and s.upi_id <> '' then   -- "Donate" button: pays the temple UPI ID with any UPI app
    r := r || jsonb_build_object('donate', jsonb_build_object(
      'upi_id', s.upi_id,
      'payee', coalesce(nullif(s.upi_payee_name, ''), nullif(s.temple_name_en, ''), nullif(s.temple_name_te, ''), s.committee_name_en),
      'amounts', to_jsonb(s.quick_amounts)));
  end if;
  if s.show_donation_total or s.show_net_position then
    r := r || jsonb_build_object('donations_total', v_don, 'donations_count', v_cnt);
  end if;
  if s.show_net_position or s.show_expense_summary or s.show_expense_details then
    r := r || jsonb_build_object('expenses_total', v_exp);
  end if;
  if s.show_net_position then
    r := r || jsonb_build_object('net', v_don - v_exp);
  end if;
  if s.show_donor_list then
    r := r || jsonb_build_object('donors', coalesce((select jsonb_agg(x) from (
        select d.donor_name as name, d.village,
               case when s.show_donor_amounts then d.amount else null end as amount,
               (d.collected_at at time zone 'Asia/Kolkata')::date as day
        from public.donations d where d.status = 'active'
        order by d.collected_at desc limit 2000) x), '[]'::jsonb));
  end if;
  if s.show_expense_summary then
    r := r || jsonb_build_object('expense_summary', coalesce((select jsonb_agg(x order by x.total desc) from (
        select coalesce(category_te, '') as category_te, coalesce(category_en, '') as category_en, sum(amount) as total
        from public.expenses where status = 'approved' group by 1, 2) x), '[]'::jsonb));
  end if;
  if s.show_expense_details then
    r := r || jsonb_build_object('expense_details', coalesce((select jsonb_agg(x) from (
        select expense_date, category_te, category_en, description, paid_to, amount
        from public.expenses where status = 'approved'
        order by expense_date desc, created_at desc limit 2000) x), '[]'::jsonb));
  end if;
  return r;
end $$;

-- Receipt verification page (link inside the WhatsApp message)
create or replace function public.get_receipt(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receipt_no', d.receipt_no, 'donor_name', d.donor_name,
    'mobile_masked', case when d.mobile is null then null else 'XXXXXX' || right(d.mobile, 4) end,
    'amount', d.amount, 'payment_mode', d.payment_mode,
    'purpose_te', d.purpose_te, 'purpose_en', d.purpose_en, 'village', d.village,
    'collected_at', d.collected_at, 'status', d.status,
    'collector_te', coalesce(nullif(p.name_te, ''), p.full_name), 'collector_en', p.full_name,
    'branding', public.get_branding())
  from public.donations d join public.profiles p on p.id = d.collected_by
  where d.verify_token = p_token;
$$;

-- Admin dashboard numbers
create or replace function public.get_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  with d as (select * from public.donations where status = 'active'),
       e as (select * from public.expenses where status = 'approved'),
       b as (select * from public.member_balances_internal())
  select jsonb_build_object(
    'donations_total', coalesce((select sum(amount) from d), 0),
    'donations_count', (select count(*) from d),
    'cash_total',      coalesce((select sum(amount) from d where payment_mode = 'cash'), 0),
    'upi_total',       coalesce((select sum(amount) from d where payment_mode = 'upi'), 0),
    'expenses_total',  coalesce((select sum(amount) from e), 0),
    'expenses_count',  (select count(*) from e),
    'today_total',     coalesce((select sum(amount) from d where (collected_at at time zone 'Asia/Kolkata')::date = v_today), 0),
    'today_count',     (select count(*) from d where (collected_at at time zone 'Asia/Kolkata')::date = v_today),
    'cash_with_members', coalesce((select sum(balance) from b where role <> 'admin' and balance > 0), 0),
    'members_with_cash', (select count(*) from b where role <> 'admin' and balance > 0),
    'owed_to_members',   coalesce((select -sum(balance) from b where role <> 'admin' and balance < 0), 0),
    'paid_back_total',   coalesce((select sum(amount) from e where settled_mode is not null), 0),
    'paid_back_cash',    coalesce((select sum(amount) from e where settled_mode = 'cash'), 0),
    'paid_back_upi',     coalesce((select sum(amount) from e where settled_mode = 'upi'), 0),
    'pending_expenses',  (select count(*) from public.expenses where status = 'pending'),
    'pending_members',   (select count(*) from public.profiles where status = 'pending'),
    'upi_unverified_count', (select count(*) from d where payment_mode = 'upi' and not upi_verified),
    'upi_unverified_total', coalesce((select sum(amount) from d where payment_mode = 'upi' and not upi_verified), 0),
    'by_category', coalesce((select jsonb_agg(x order by x.total desc) from (
        select coalesce(category_te, '') as category_te, coalesce(category_en, '') as category_en, sum(amount) as total
        from e group by 1, 2) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(x order by x.day) from (
        select (collected_at at time zone 'Asia/Kolkata')::date as day, sum(amount) as total, count(*) as cnt
        from d group by 1) x), '[]'::jsonb),
    'by_member', coalesce((select jsonb_agg(x order by x.total desc) from (
        select p.id, p.full_name, p.name_te, p.role, sum(d.amount) as total, count(*) as cnt,
               sum(case when d.payment_mode = 'cash' then d.amount else 0 end) as cash,
               sum(case when d.payment_mode = 'upi' then d.amount else 0 end) as upi
        from d join public.profiles p on p.id = d.collected_by
        group by p.id, p.full_name, p.name_te, p.role) x), '[]'::jsonb)
  ) into r;

  r := r || public.cash_position_internal();   -- versions 8–9: opening balance, cash in hand, cash at bank
  return r;
end $$;

-- Member's own summary (home screen)
create or replace function public.get_my_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  r jsonb;
begin
  if not public.is_active_user() then raise exception 'not_allowed'; end if;
  select jsonb_build_object(
    'today_total', coalesce((select sum(amount) from public.donations where collected_by = v_uid and status = 'active'
                             and (collected_at at time zone 'Asia/Kolkata')::date = v_today), 0),
    'today_count', (select count(*) from public.donations where collected_by = v_uid and status = 'active'
                             and (collected_at at time zone 'Asia/Kolkata')::date = v_today),
    'total', coalesce((select sum(amount) from public.donations where collected_by = v_uid and status = 'active'), 0),
    'count', (select count(*) from public.donations where collected_by = v_uid and status = 'active'),
    'cash_total', coalesce((select cash_collected from public.member_balances_internal() where member_id = v_uid), 0),
    'expenses_approved', coalesce((select expenses_approved from public.member_balances_internal() where member_id = v_uid), 0),
    'handed_over', coalesce((select handed_over from public.member_balances_internal() where member_id = v_uid), 0),
    'balance', coalesce((select balance from public.member_balances_internal() where member_id = v_uid), 0),
    'unsettled_count', coalesce((select unsettled_count from public.member_balances_internal() where member_id = v_uid), 0),
    'pending_expenses', (select count(*) from public.expenses where created_by = v_uid and status = 'pending'),
    'paid_back', coalesce((select sum(amount) from public.expenses where paid_by = v_uid and status = 'approved' and settled_mode is not null), 0),
    'paid_back_count', (select count(*) from public.expenses where paid_by = v_uid and status = 'approved' and settled_mode is not null),
    'handovers', coalesce((select jsonb_agg(x order by x.received_at desc) from (
        select h.id, h.expected_amount, h.amount_received, h.note, h.received_at,
               coalesce(nullif(rp.name_te, ''), rp.full_name) as receiver_te, rp.full_name as receiver_en
        from public.handovers h join public.profiles rp on rp.id = h.received_by
        where h.member_id = v_uid order by h.received_at desc limit 20) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Cash each member is holding (admin)
create or replace function public.get_member_balances() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('paid_back', coalesce(pb.s, 0), 'setoff_open', coalesce(so.n, 0))
                                     order by b.balance desc)
                   from public.member_balances_internal() b
                   left join (select paid_by, sum(amount) s from public.expenses
                              where status = 'approved' and settled_mode is not null group by 1) pb on pb.paid_by = b.member_id
                   left join (select paid_by, count(*) n from public.expenses   -- set off, not yet in a handover → can be paid back
                              where status = 'approved' and paid_by is not null and settled_mode is null and handover_id is null
                              group by 1) so on so.paid_by = b.member_id
                   where b.role <> 'admin' or b.balance <> 0), '[]'::jsonb);
end $$;

-- Day-end cash handover (admin confirms money received from a member)
create or replace function public.confirm_handover(p_member uuid, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_expected numeric; v_id uuid; v_uid uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_member = v_uid then raise exception 'cannot_handover_self'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select balance into v_expected from public.member_balances_internal() where member_id = p_member;
  if v_expected is null then raise exception 'member_not_found'; end if;
  insert into public.handovers (member_id, expected_amount, amount_received, note, received_by)
  values (p_member, v_expected, p_amount, nullif(btrim(coalesce(p_note, '')), ''), v_uid)
  returning id into v_id;
  update public.donations set handover_id = v_id
   where collected_by = p_member and status = 'active' and payment_mode = 'cash' and handover_id is null;
  update public.expenses set handover_id = v_id
   where paid_by = p_member and status = 'approved' and handover_id is null and settled_mode is null;
  perform public.write_audit('handover_confirmed', 'handover', v_id::text,
    jsonb_build_object('member', p_member, 'expected', v_expected, 'received', p_amount));
  return jsonb_build_object('id', v_id, 'expected', v_expected, 'received', p_amount,
                            'difference', v_expected - p_amount);
end $$;

create or replace function public.cancel_donation(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'reason_required'; end if;
  update public.donations
     set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id and status = 'active';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.set_upi_verified(p_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.donations
     set upi_verified = p_value,
         upi_verified_by = case when p_value then auth.uid() else null end,
         upi_verified_at = case when p_value then now() else null end
   where id = p_id and payment_mode = 'upi';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.mark_receipt_shared(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.donations set shared_at = now()
   where id = p_id and (collected_by = auth.uid() or public.is_admin());
end $$;

create or replace function public.review_expense(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.expenses
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- Version 7 – settle a member's expense: p_mode 'cash' / 'upi' = the admin paid the member back (not deducted
-- from the member's collections any more); p_mode null = undo → set off against collections again.
create or replace function public.settle_expense(p_id uuid, p_mode text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.expenses%rowtype;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_mode is not null and p_mode not in ('cash', 'upi') then raise exception 'invalid_mode'; end if;
  select * into e from public.expenses where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if e.paid_by is null then raise exception 'not_member_expense'; end if;
  if e.status <> 'approved' then raise exception 'not_approved'; end if;
  perform set_config('app.settle_expense', 'on', true);
  if p_mode is not null then
    if e.settled_mode is not null then raise exception 'already_paid_back'; end if;
    if e.handover_id is not null then raise exception 'already_set_off'; end if;   -- already used in a cash handover
    update public.expenses
       set settled_mode = p_mode, settled_at = now(), settled_by = auth.uid(),
           settled_ref = nullif(btrim(coalesce(p_ref, '')), '')
     where id = p_id;
    perform public.write_audit('expense_paid_back', 'expense', p_id::text,
      jsonb_build_object('amount', e.amount, 'member', e.paid_by, 'mode', p_mode, 'category', e.category_en,
                         'note', nullif(btrim(coalesce(p_ref, '')), '')));
  else
    if e.settled_mode is null then raise exception 'not_paid_back'; end if;
    update public.expenses set settled_mode = null, settled_at = null, settled_by = null, settled_ref = null where id = p_id;
    perform public.write_audit('expense_payback_undone', 'expense', p_id::text,
      jsonb_build_object('amount', e.amount, 'member', e.paid_by, 'mode', e.settled_mode, 'category', e.category_en));
  end if;
  perform set_config('app.settle_expense', '', true);
  return (select to_jsonb(x) from public.expenses x where x.id = p_id);
end $$;

-- Version 7 – the committee's financial position for team members (only when the admin switched it on).
create or replace function public.get_finance_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception 'not_allowed'; end if;
  if not public.is_admin() and not coalesce((select members_see_finance from public.app_settings where id = 1), false) then
    raise exception 'not_allowed';
  end if;
  return jsonb_build_object(
    'donations_total', coalesce((select sum(amount) from public.donations where status = 'active'), 0),
    'donations_count', (select count(*) from public.donations where status = 'active'),
    'expenses_total',  coalesce((select sum(amount) from public.expenses where status = 'approved'), 0),
    'expenses_count',  (select count(*) from public.expenses where status = 'approved'))
    || public.cash_position_internal();   -- version 9: members see cash in hand / cash at bank too
end $$;

create or replace function public.create_member_invite(p_mobile text, p_full_name text, p_name_te text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_mobile text := public.normalize_mobile(p_mobile);
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if v_mobile is null or v_mobile !~ '^[0-9]{10}$' then raise exception 'invalid_mobile'; end if;
  if coalesce(p_role, 'member') not in ('admin', 'member') then raise exception 'invalid_role'; end if;
  if exists (select 1 from public.profiles where mobile = v_mobile) then raise exception 'mobile_exists'; end if;
  insert into public.member_invites (mobile, full_name, name_te, role, created_by)
  values (v_mobile, btrim(coalesce(p_full_name, '')), btrim(coalesce(p_name_te, '')), coalesce(p_role, 'member'), auth.uid())
  on conflict (mobile) do update
    set full_name = excluded.full_name, name_te = excluded.name_te, role = excluded.role,
        created_by = excluded.created_by, created_at = now();
  return v_mobile;
end $$;

create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  -- Logins use a 6-digit PIN (the PIN is stored as the account password).
  if p_password is null or p_password !~ '^[0-9]{6}$' then raise exception 'pin_invalid'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"pin_set": true}'::jsonb,
         updated_at = now()
   where id = p_user;
  if not found then raise exception 'not_found'; end if;
  perform public.write_audit('password_reset', 'profile', p_user::text, null);
end $$;

create or replace function public.regenerate_public_slug()
returns text language plpgsql security definer set search_path = '' as $$
declare v text := encode(extensions.gen_random_bytes(5), 'hex');
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.app_settings set public_slug = v where id = 1;
  perform public.write_audit('public_link_changed', 'settings', '1', null);
  return v;
end $$;

-- Version of this script. The app compares it with the version it needs and tells the admin
-- "database update needed" (= run this file again) when it is older.
--   2 = data tools (export / delete)   3 = 6-digit PIN reset + logo upload permission   4 = splash screen
--   5 = puja schedule   6 = "Donate" (UPI) on the public page, QR poster editor, Telugu names in the schedules
--   7 = member expenses paid back by the admin (cash / temple UPI), members may see the financial position
create or replace function public.get_db_version() returns int
language sql immutable set search_path = '' as $$ select 9 $$;

-- Settings → Delete data (admin only). Two checks on the server: the word DELETE + the admin's own
-- password (5 wrong passwords → locked for 15 minutes). Deletes every festival record and restarts
-- receipt numbers at 0001. Keeps: settings, logo, member logins (unless p_remove_members = true).
-- Bill photo files are removed by the app (Storage API) using the returned 'bill_paths'.
create or replace function public.admin_delete_all_data(p_password text, p_confirm text, p_remove_members boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_fails int;
  v_counts jsonb;
  v_bills jsonb;
  v_removed int := 0;
  v_blocked int := 0;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if coalesce(btrim(p_confirm), '') <> 'DELETE' then
    return jsonb_build_object('ok', false, 'error', 'confirm_word');
  end if;
  select count(*) into v_fails from public.audit_log
   where actor = v_uid and action = 'delete_all_wrong_password' and at > now() - interval '15 minutes';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  select encrypted_password into v_hash from auth.users where id = v_uid;
  if coalesce(v_hash, '') = '' or extensions.crypt(coalesce(p_password, ''), v_hash) is distinct from v_hash then
    perform public.write_audit('delete_all_wrong_password', 'all', null, null);   -- kept: no exception raised
    return jsonb_build_object('ok', false, 'error', 'wrong_password', 'attempts_left', greatest(0, 4 - v_fails));
  end if;

  perform pg_advisory_xact_lock(hashtext('utsav_delete_all_data'));
  select coalesce(jsonb_agg(bill_path), '[]'::jsonb) into v_bills
    from public.expenses where coalesce(bill_path, '') <> '';
  v_counts := jsonb_build_object(
    'donations',       (select count(*) from public.donations),
    'donations_total', coalesce((select sum(amount) from public.donations where status = 'active'), 0),
    'expenses',        (select count(*) from public.expenses),
    'expenses_total',  coalesce((select sum(amount) from public.expenses where status = 'approved'), 0),
    'handovers',       (select count(*) from public.handovers),
    'programs',        (select count(*) from public.programs),
    'festival_days',   (select count(*) from public.festival_days),
    'pujas',           (select count(*) from public.pujas),
    'transfers',       (select count(*) from public.cash_transfers),
    'history',         (select count(*) from public.audit_log));

  delete from public.donations where true;      -- "where true": allowed even where DELETE-without-WHERE is blocked
  delete from public.expenses where true;
  delete from public.handovers where true;
  delete from public.programs where true;
  delete from public.festival_days where true;
  delete from public.pujas where true;
  delete from public.cash_transfers where true;
  delete from public.audit_log where true;
  update public.receipt_counter set last_no = 0 where id = 1;

  if coalesce(p_remove_members, false) then
    delete from public.member_invites where true;
    begin
      with gone as (
        delete from auth.users u where u.id in (select p.id from public.profiles p where p.role <> 'admin')
        returning 1)
      select count(*) into v_removed from gone;
      delete from public.profiles where role <> 'admin';   -- profiles without a login
    exception when insufficient_privilege or foreign_key_violation then   -- not allowed here → block them instead
      update public.profiles set status = 'blocked' where role <> 'admin' and status <> 'blocked';
      get diagnostics v_blocked = row_count;
    end;
  end if;

  v_counts := v_counts || jsonb_build_object('members_removed', v_removed, 'members_blocked', v_blocked);
  perform public.write_audit('data_deleted', 'all', null, v_counts);
  return v_counts || jsonb_build_object('ok', true, 'bill_paths', v_bills);
end $$;

-- Settings → Export data writes a line in the history, so "Delete data" can warn when a year
-- was never exported (or changed after its last export).
create or replace function public.log_data_export(p_year int, p_details jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  perform public.write_audit('data_exported', 'export', coalesce(p_year::text, 'all'), p_details);
end $$;

-- function permissions
revoke execute on function public.log_data_export(int, jsonb) from public, anon;
grant execute on function public.log_data_export(int, jsonb) to authenticated;
revoke execute on function public.admin_delete_all_data(text, text, boolean) from public, anon;
grant execute on function public.admin_delete_all_data(text, text, boolean) to authenticated;
grant execute on function public.get_db_version() to anon, authenticated;
revoke execute on function public.member_balances_internal() from public, anon, authenticated;
revoke execute on function public.cash_position_internal() from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_profile_internal(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.get_branding() to anon, authenticated;
grant execute on function public.get_public_page(text) to anon, authenticated;
grant execute on function public.get_receipt(text) to anon, authenticated;
grant execute on function public.is_admin(), public.is_active_user() to authenticated;
revoke execute on function public.get_dashboard(), public.get_my_summary(), public.get_member_balances(),
  public.confirm_handover(uuid, numeric, text), public.cancel_donation(uuid, text),
  public.set_upi_verified(uuid, boolean), public.mark_receipt_shared(uuid),
  public.review_expense(uuid, boolean, text), public.create_member_invite(text, text, text, text),
  public.admin_reset_password(uuid, text), public.regenerate_public_slug() from public, anon;
grant execute on function public.get_dashboard(), public.get_my_summary(), public.get_member_balances(),
  public.confirm_handover(uuid, numeric, text), public.cancel_donation(uuid, text),
  public.set_upi_verified(uuid, boolean), public.mark_receipt_shared(uuid),
  public.review_expense(uuid, boolean, text), public.create_member_invite(text, text, text, text),
  public.admin_reset_password(uuid, text), public.regenerate_public_slug() to authenticated;
revoke execute on function public.settle_expense(uuid, text, text), public.get_finance_summary() from public, anon;
grant execute on function public.settle_expense(uuid, text, text), public.get_finance_summary() to authenticated;

-- ---------------------------------------------------------------------
-- 6. FILE STORAGE (bill photos = private, logo = public)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('bills', 'bills', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('assets', 'assets', true) on conflict (id) do nothing;

drop policy if exists "utsav bills upload" on storage.objects;
create policy "utsav bills upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_user());
drop policy if exists "utsav bills read" on storage.objects;
create policy "utsav bills read" on storage.objects for select to authenticated
  using (bucket_id = 'bills' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "utsav bills delete" on storage.objects;
create policy "utsav bills delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bills' and public.is_admin());
drop policy if exists "utsav assets upload" on storage.objects;
create policy "utsav assets upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and public.is_admin());
drop policy if exists "utsav assets update" on storage.objects;
create policy "utsav assets update" on storage.objects for update to authenticated
  using (bucket_id = 'assets' and public.is_admin());
drop policy if exists "utsav assets delete" on storage.objects;
create policy "utsav assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and public.is_admin());
-- Saving a file returns its details, which needs read access (without this the logo upload failed
-- with "permission denied"). Visitors still see the logo through its public link.
drop policy if exists "utsav assets read" on storage.objects;
create policy "utsav assets read" on storage.objects for select to authenticated
  using (bucket_id = 'assets' and public.is_admin());

-- refresh the API so the new tables/functions are visible immediately
notify pgrst, 'reload schema';

-- Done! ✅  Next: open the app and create the FIRST account — it becomes the Admin.
