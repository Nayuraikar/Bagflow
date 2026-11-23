# BagFlow schemas (v0.1)

## Bag table (structure of arrays)
| column | type | meaning |
|---|---|---|
| id | u32 | index, sorted by arrival time |
| pax | u32 | passenger id (flight*512 + seat index) |
| flight | u32 | flight id |
| weight_dg | u16 | weight in 0.1 kg |
| priority | u8 | 0 standard, 1 priority, 2 tight connection |
| flags | u8 | bit0 transfer, bit1 special (oversize/fragile) |
| arrival_s | u32 | seconds since midnight |
| deadline_s | u32 | must be loaded by this time |

Binary file: "BFLW0001", n (u64 LE), then each column in the order above, little-endian.

## Determinism rules
- One master seed. ChaCha8 stream per purpose, plus one stream per flight.
- Integer time everywhere (seconds in data, milliseconds in the simulator).
- Same-time events ordered by (time, kind, bag_id, seq). Kind order: Repair, Failure, ServiceComplete, TransitComplete, Arrival.

## Event log (events.bin)
Header "BFEV0001" + n (u64 LE), then n records of 12 bytes: time_ms u32, bag u32, from u8, to u8, node u8, pad u8.
A record with from == to is the bag-creation event. Transitions are logged at node arrival, except
Screening->HeldForInspection/Cleared, Sorted->TransferPending and Loading->Loaded/Delayed, which are logged at service completion.
The frontend derives departure time from a node as (next arrival time - edge travel_ms).
