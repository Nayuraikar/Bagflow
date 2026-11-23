
## Phase 1 generator assumptions (all to be justified in the report)
- Load factor ~ Beta(16, 4), mean 0.80.
- Bags per passenger: 0 (22%), 1 (55%), 2 (20%), 3 (3%).
- Weight ~ LogNormal(ln 17 kg, 0.35), clipped to 3-32 kg.
- Origin bag arrival: Beta(4, 2.2) over the window 180 to 45 min before departure; 2% arrive up to 15 min after cutoff.
- 30% of passengers are transfers, arriving 120 to 30 min before departure.
- Priority: origin 3% priority; transfer 15% tight connection, 5% priority. 2% special bags.
- Loading deadline: departure minus 20 min (origin) or 15 min (transfer).
- Departure banks centred at 07:00, 09:30, 12:30, 15:00, 18:30, 21:00 (sd 45 min).
- Observed Wq errors are small and mostly negative (-3.3% to +0.4%). Likely causes: arrival times quantised to whole seconds (slightly less bursty than true Poisson) and the empty-system start. Both bias waits downward.
- Scaled-network throughput is 0.37M (250k), 0.30M (1M) and 0.24M (5M) bags/s, so per-bag cost grows with size (larger heap, log and server count; likely cache effects).

## Phase 3b scaling baseline
- Sequential engine, 6-node chain, FCFS, lognormal service, 5% inspection holds. Throughput about 0.35-0.5M bags/s (about 4M events/s).
- results/scaling_seq_fixed_network.txt: network fixed at 250k-sized capacity. At 1M+ bags screening saturates and 95-99% of bags are delayed. This shows capacity saturation, not an engine fault.
- results/scaling_seq.txt: servers scaled by ceil(bags/250k), so load per server stays constant. Use these as the baseline for parallel backends.
