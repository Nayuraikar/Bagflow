use crate::types::*;

pub const N_CHECKIN: u16 = 0;
pub const N_IDENT: u16 = 1;
pub const N_SCREEN: u16 = 2;
pub const N_CONVEYOR: u16 = 3;
pub const N_SORTER: u16 = 4;
pub const N_LOADING: u16 = 5;

/// The hard-coded 6-node chain for the Phase 2 slice.
/// Edge i goes from node i to node i+1. Node id == index.
pub fn slice_network() -> (Vec<Node>, Vec<Edge>) {
    // (kind, parallel servers, mean service ms)
    let spec: [(NodeKind, u16, u32); 6] = [
        (NodeKind::CheckIn, 40, 5_000),
        (NodeKind::Identification, 4, 400),
        (NodeKind::Screening, 16, 2_000),
        (NodeKind::Conveyor, 200, 20_000),
        (NodeKind::Sorter, 8, 1_000),
        (NodeKind::Loading, 30, 4_000),
    ];
    let travel_ms: [u32; 5] = [6_000, 8_000, 10_000, 12_000, 9_000];

    let nodes: Vec<Node> = spec
        .iter()
        .enumerate()
        .map(|(i, (kind, servers, svc))| Node {
            id: i as u16,
            kind: *kind,
            servers: *servers,
            mean_service_ms: *svc,
            queue_capacity: 100_000,
            x: 90.0 + i as f32 * 164.0,
            y: if i % 2 == 0 { 210.0 } else { 140.0 },
            online: true,
        })
        .collect();

    let edges: Vec<Edge> = (0..5)
        .map(|i| Edge {
            from: i as u16,
            to: i as u16 + 1,
            travel_ms: travel_ms[i],
            capacity_per_min: 600,
            online: true,
        })
        .collect();

    (nodes, edges)
}
