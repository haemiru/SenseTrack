-- SenseTrack — 세션 리포트 테이블
-- 기존 jjangasem-bookshop 프로젝트를 공유하므로 모든 객체에 'sensetrack_' prefix를 붙인다.
-- Supabase 대시보드 SQL Editor에서 실행하거나 `supabase db push`로 적용.

create table if not exists public.sensetrack_sessions (
    id               uuid primary key default gen_random_uuid(),
    created_at       timestamptz not null default now(),
    breathing        int,
    breathing_status text,
    breathing_change int,
    duration         numeric,
    report           jsonb not null
);

-- 조회용 인덱스
create index if not exists sensetrack_sessions_created_at_idx
    on public.sensetrack_sessions (created_at desc);

-- RLS: 인증 없이 anon key로 동작하는 앱이므로 익명 INSERT만 허용 (읽기는 막음)
alter table public.sensetrack_sessions enable row level security;

drop policy if exists sensetrack_anon_insert on public.sensetrack_sessions;
create policy sensetrack_anon_insert
    on public.sensetrack_sessions
    for insert
    to anon
    with check (true);
