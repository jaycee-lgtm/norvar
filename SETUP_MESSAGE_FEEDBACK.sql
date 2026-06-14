-- Run in Supabase SQL Editor
-- Stores thumbs up/down on AI replies for monitoring and response-framing tuning.

create table if not exists message_feedback (
    id               uuid primary key default gen_random_uuid(),
    user_id          text not null,
    source           text not null check (source in ('conversation', 'assessment', 'gap_chat')),
    container_id     uuid not null,
    message_id       uuid not null,
    gap_key          text,
    agent            text not null default 'nora',
    rating           text not null check (rating in ('up', 'down')),
    message_content  text not null,
    user_message     text,
    created_at       timestamptz default now(),
    updated_at       timestamptz default now(),
    unique (user_id, message_id)
);

create index if not exists message_feedback_rating_created_idx
    on message_feedback (rating, created_at desc);

create index if not exists message_feedback_container_idx
    on message_feedback (source, container_id);

grant all on public.message_feedback to service_role;
