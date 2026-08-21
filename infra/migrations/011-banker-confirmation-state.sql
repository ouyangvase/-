-- Project 12: close betting first, then require banker confirmation before packet creation.
-- This migration is additive to live data; it only widens the allowed round-state values.
ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_state_check;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_state_check CHECK (state IN (
    'LOBBY', 'BANKER_BIDDING', 'BETTING', 'WAITING_BANKER_CONFIRM', 'PACKET_SENT',
    'CLAIMING', 'EVALUATING', 'SETTLING', 'ROUND_COMPLETE', 'ROUND_CANCELLED',
    'REFUNDING', 'REFUNDED', 'DISPUTED'
  ));
