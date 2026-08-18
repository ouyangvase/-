# Demo Rules

- All balances are simulation points with up to two decimal places and no cash value.
- Point calculation follows the supplied rules-deck example: sum packet digits, take the last digit, and represent zero as 10 points.
- The demo rule version is `demo-v1-source-confirmed-examples` and is immutable after round start.
- Visible special-hand examples use the deck's categories and multipliers; ordinary hands use their points as the multiplier.
- Rule comparison is type, then points, then packet amount; equal inputs tie.
- Packet values use HMAC-SHA256 with a server seed and deterministic input.
- The deck does not enumerate every special-hand input, so this is not a claim of complete production rules.
