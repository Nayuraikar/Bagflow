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

/// Phase 4 layered network: 10 nodes. `k` multiplies every server count (scale with bag count).
/// ids: 0 check-in, 1 identification, 2-3 screening lines A/B, 4-6 sorters, 7-9 loading areas.
pub fn airport_network(k: u16) -> (Vec<Node>, Vec<Edge>) {
    // (kind, servers, mean service ms, layer, row)
    let spec: [(NodeKind, u16, u32, f32, f32); 10] = [
        (NodeKind::CheckIn, 40, 5_000, 0.0, 1.0),
        (NodeKind::Identification, 4, 400, 1.0, 1.0),
        (NodeKind::Screening, 10, 1_800, 2.0, 0.0),
        (NodeKind::Screening, 6, 2_500, 2.0, 2.0),
        (NodeKind::Sorter, 4, 1_000, 3.0, 0.0),
        (NodeKind::Sorter, 4, 1_000, 3.0, 1.0),
        (NodeKind::Sorter, 4, 1_000, 3.0, 2.0),
        (NodeKind::Loading, 12, 4_000, 4.0, 0.0),
        (NodeKind::Loading, 12, 4_000, 4.0, 1.0),
        (NodeKind::Loading, 12, 4_000, 4.0, 2.0),
    ];
    let nodes: Vec<Node> = spec
        .iter()
        .enumerate()
        .map(|(i, (kind, servers, svc, layer, row))| Node {
            id: i as u16,
            kind: *kind,
            servers: *servers * k,
            mean_service_ms: *svc,
            queue_capacity: 1_000_000,
            x: 90.0 + layer * 190.0,
            y: 90.0 + row * 100.0,
            online: true,
        })
        .collect();

    let mut raw: Vec<(u16, u16, u32)> = vec![(0, 1, 6_000), (1, 2, 8_000), (1, 3, 9_000)];
    for (s, from) in [2u16, 3u16].iter().enumerate() {
        for j in 0..3u16 {
            let d = if s == 0 { j } else { 2 - j };
            raw.push((*from, 4 + j, 10_000 + 2_000 * d as u32));
        }
    }
    for i in 0..3u16 {
        for j in 0..3u16 {
            let d = (i as i32 - j as i32).abs() as u32;
            raw.push((4 + i, 7 + j, 9_000 + 2_000 * d));
        }
    }
    let edges: Vec<Edge> = raw
        .iter()
        .map(|(f, t, ms)| Edge { from: *f, to: *t, travel_ms: *ms, capacity_per_min: 600, online: true })
        .collect();
    (nodes, edges)
}
