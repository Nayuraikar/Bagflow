
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

## Phase 4 routing and queue policies
- Layered network: check-in, identification, 2 screening lines (A: 10x1.8 s, B: 6x2.5 s), 3 sorters (4x1 s), 3 loading areas (12x4 s). Loading area = flight id mod 3; screening line and sorter are routing choices.
- Dijkstra: reverse-graph shortest path on free-flow time (travel + mean service), ties to lowest node id. ECMP: same costs, near-equal options (within 0.1%) chosen by bag id. Congestion: static cost + estimated wait ((queue + busy + 1 - servers)/servers x mean service). Deadline: congestion routing if slack < 20 min, else ECMP.
- A* not implemented: with an exact distance heuristic on this layered graph it expands the same nodes as Dijkstra.
- Policies: FCFS, Priority (tight=0, priority=1, standard=2), EDF (deadline), SPT (sampled service time).
- Service times are a hash of (seed, bag, stage), so all strategies see identical randomness (common random numbers). Lognormal sigma 0.4, 5% screening inspection (+ lognormal mean 20 s).
- Edge capacities and failures are not modelled yet (Phase 7). Results in results/compare_phase4.txt.
- Caveat: SPT's p95 advantage holds only at 100% load. In overload (70%, 55%) SPT lowers the mean and the delayed share but can raise the tail (dijkstra+spt p95 25,747 s vs 20,456 s with FCFS at 70%), because long jobs are starved.
- Phase 4 first run (results/compare_phase4.txt) used servers x2: over-provisioned, 0% delayed, all strategies identical; kept as a sanity check.
- Informative comparison: results/compare_phase4_stressed.txt (servers x1, 100%). Overload cases: compare_phase4_overload70.txt and compare_phase4_overload55.txt, where 50-90% of bags are delayed and EDF no longer helps.
- Findings: queue policy matters more than routing at moderate load. Priority removes tight-connection delays, EDF removes all delays at 100% load but raises p95, SPT gives the lowest mean. EDF degrades under overload.

## Phase 5 scenarios (results/scenarios_phase5.txt)
- Window 17:00-19:00 on the 250k dataset, network at servers x1 (100%). Outages: 90 min starting 17:00.
- PeakSurge: 50% extra bags cloned from arrivals 17:00-18:00, arriving up to 10 min later (same flight and deadline).
- ConveyorFailure: edge screening A -> sorter 4 down; bags reroute over live edges (if none are live the edge is used anyway).
- ScreeningDelay: screening line A capacity x0.4. Bags already in service finish; queued bags wait. Capacity restored at repair and the queue restarts.
- ConnectingRush: 60% of transfer bags arriving 17:00-18:30 become tight-connection with a 30 min deadline.
- SorterOverload: 60% of bags 17:00-19:00 redirected to loading area 7 (flight id rounded down to a multiple of 3).
- Not yet modelled: early-bag storage, MCT-based transfers, loader limits, edge capacity limits, random MTBF failures, multi-stage screening beyond the 5% inspection hold.
- Findings: ConveyorFailure is almost invisible (identical to Normal within 1 s mean) because screening, not the conveyor, is the bottleneck and bags reroute over the other two sorter exits. ScreeningDelay and PeakSurge are the most damaging (16-21% delayed vs 3-4%). EDF degrades under overload (ScreeningDelay dijkstra: 20.6% EDF vs 17.9% FCFS). SorterOverload shows the largest routing benefit: congestion+EDF 0.0% delayed vs dijkstra+EDF 8.5%.
