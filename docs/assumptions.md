
## Phase 1 generator assumptions (all to be justified in the report)
- Load factor ~ Beta(16, 4), mean 0.80.
- Bags per passenger: 0 (22%), 1 (55%), 2 (20%), 3 (3%).
- Weight ~ LogNormal(ln 17 kg, 0.35), clipped to 3-32 kg.
- Origin bag arrival: Beta(4, 2.2) over the window 180 to 45 min before departure; 2% arrive up to 15 min after cutoff.
- 30% of passengers are transfers, arriving 120 to 30 min before departure.
- Priority: origin 3% priority; transfer 15% tight connection, 5% priority. 2% special bags.
- Loading deadline: departure minus 20 min (origin) or 15 min (transfer).
- Departure banks centred at 07:00, 09:30, 12:30, 15:00, 18:30, 21:00 (sd 45 min).
