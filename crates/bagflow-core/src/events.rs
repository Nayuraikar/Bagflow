use crate::state::BagState;
use serde::{Deserialize, Serialize};

/// Declaration order IS the tie-break order for events at the same time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum EventKind {
    Repair = 0,
    Failure = 1,
    ServiceComplete = 2,
    TransitComplete = 3,
    Arrival = 4,
}

/// Item in the simulation's priority queue (wrap in std::cmp::Reverse for a min-heap).
/// Field order matters: derived Ord compares fields top to bottom.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct ScheduledEvent {
    pub time_ms: u64,
    pub kind: EventKind,
    pub bag_id: u32,
    pub seq: u64, // unique, assigned in insertion order, makes ordering total
    pub node: u16,
}

/// One line of the event log the frontend replays.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LogEvent {
    pub time_ms: u64,
    pub bag_id: u32,
    pub from: BagState,
    pub to: BagState,
    pub node: u16,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Reverse;
    use std::collections::BinaryHeap;

    fn ev(t: u64, k: EventKind, bag: u32, seq: u64) -> ScheduledEvent {
        ScheduledEvent { time_ms: t, kind: k, bag_id: bag, seq, node: 0 }
    }

    #[test]
    fn time_first_then_kind_then_bag_then_seq() {
        let mut h = BinaryHeap::new();
        h.push(Reverse(ev(10, EventKind::Arrival, 1, 0)));
        h.push(Reverse(ev(10, EventKind::ServiceComplete, 9, 1)));
        h.push(Reverse(ev(5, EventKind::Arrival, 3, 2)));
        h.push(Reverse(ev(10, EventKind::ServiceComplete, 2, 3)));
        let order: Vec<(u64, EventKind, u32)> = std::iter::from_fn(|| h.pop())
            .map(|Reverse(e)| (e.time_ms, e.kind, e.bag_id))
            .collect();
        assert_eq!(
            order,
            vec![
                (5, EventKind::Arrival, 3),
                (10, EventKind::ServiceComplete, 2),
                (10, EventKind::ServiceComplete, 9),
                (10, EventKind::Arrival, 1),
            ]
        );
    }
}
