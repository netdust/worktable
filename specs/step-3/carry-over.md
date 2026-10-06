# Step 3 (Queries + views on queries): carry-over from the step 0e shakeout

Decided by Stefan on 2026-10-06, after he accepted the shakeout of the real Laika import.
Source: "record in the step 1 and step 3 specs that conflict detection must cope with the 114 untimed activities, and that 30 name-only assignments don't count toward availability."

## Constraints
- **Untimed activities.** Conflict detection must handle activities with a `datum` and no `start_at` (114 of 246 in the import, 100 of them confirmed). Two untimed activities for one person on the same day cannot be judged by overlapping times (90 such pairs over 10 people in the import). The conflict rule has to say what they are (a same-day warning, or no conflict), and a test has to pin it. They must never silently count as no overlap.
- **Name-only assignments.** A Toewijzing with only a free-text `naam` and no `persoon_id` (30 in the import) does not count toward a person's availability or conflicts, because no person record exists to count against.
