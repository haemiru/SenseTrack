-- SenseTrack — 로그인 사용자 기준 저장으로 전환
-- 짱샘의 책방과 같은 Supabase 프로젝트(auth.users 공유)를 사용한다.
-- 모든 객체에 'sensetrack_' prefix 유지. Supabase SQL Editor에서 실행하거나 `supabase db push`.

-- 1) 소유자 컬럼 추가 (로그인 사용자 = auth.users.id)
alter table public.sensetrack_sessions
    add column if not exists user_id uuid references auth.users (id) default auth.uid();

-- 2) 기존 익명 INSERT 정책 제거 (있었다면) — 더는 익명 저장을 허용하지 않는다
drop policy if exists sensetrack_anon_insert on public.sensetrack_sessions;

-- 3) 로그인 사용자: 본인 행만 INSERT 허용
drop policy if exists sensetrack_auth_insert on public.sensetrack_sessions;
create policy sensetrack_auth_insert
    on public.sensetrack_sessions
    for insert
    to authenticated
    with check (auth.uid() = user_id);

-- 4) 로그인 사용자: 본인 행만 SELECT 허용 (지난 기록 조회/비교용)
drop policy if exists sensetrack_auth_select on public.sensetrack_sessions;
create policy sensetrack_auth_select
    on public.sensetrack_sessions
    for select
    to authenticated
    using (auth.uid() = user_id);

-- 5) 사용자별 최신순 조회 인덱스
create index if not exists sensetrack_sessions_user_id_idx
    on public.sensetrack_sessions (user_id, created_at desc);
