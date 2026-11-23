use serde::{Deserialize, Serialize};

/// The 12 bag states from the project spec. repr(u8) so it fits in a SoA column.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BagState {
    CheckedIn = 0,
    Identified,
    Screening,
    Cleared,
    InTransit,
    Sorted,
    TransferPending,
    Loading,
    Loaded,
    Delayed,
    Misrouted,
    HeldForInspection,
}

impl BagState {
    pub const ALL: [BagState; 12] = [
        BagState::CheckedIn,
        BagState::Identified,
        BagState::Screening,
        BagState::Cleared,
        BagState::InTransit,
        BagState::Sorted,
        BagState::TransferPending,
        BagState::Loading,
        BagState::Loaded,
        BagState::Delayed,
        BagState::Misrouted,
        BagState::HeldForInspection,
    ];

    /// Final states: nothing leaves them.
    pub fn is_terminal(self) -> bool {
        matches!(self, BagState::Loaded | BagState::Delayed)
    }

    /// Allowed transitions. Any non-terminal state may go to Delayed.
    pub fn can_transition_to(self, to: BagState) -> bool {
        use BagState::*;
        if self.is_terminal() {
            return false;
        }
        if to == Delayed {
            return true;
        }
        matches!(
            (self, to),
            (CheckedIn, Identified)
                | (Identified, Screening)
                | (Screening, Cleared)
                | (Screening, HeldForInspection)
                | (HeldForInspection, Cleared)
                | (Cleared, InTransit)
                | (InTransit, Sorted)
                | (InTransit, Misrouted)
                | (Misrouted, InTransit)
                | (Sorted, TransferPending)
                | (Sorted, Loading)
                | (TransferPending, Loading)
                | (Loading, Loaded)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use BagState::*;

    #[test]
    fn there_are_twelve_states() {
        assert_eq!(BagState::ALL.len(), 12);
    }

    #[test]
    fn happy_path_is_legal() {
        let path = [CheckedIn, Identified, Screening, Cleared, InTransit, Sorted, Loading, Loaded];
        for w in path.windows(2) {
            assert!(w[0].can_transition_to(w[1]), "{:?} -> {:?}", w[0], w[1]);
        }
    }

    #[test]
    fn inspection_and_transfer_paths() {
        assert!(Screening.can_transition_to(HeldForInspection));
        assert!(HeldForInspection.can_transition_to(Cleared));
        assert!(Sorted.can_transition_to(TransferPending));
        assert!(TransferPending.can_transition_to(Loading));
        assert!(InTransit.can_transition_to(Misrouted));
        assert!(Misrouted.can_transition_to(InTransit));
    }

    #[test]
    fn terminal_states_are_final() {
        for to in BagState::ALL {
            assert!(!Loaded.can_transition_to(to));
            assert!(!Delayed.can_transition_to(to));
        }
    }

    #[test]
    fn illegal_jumps_are_rejected() {
        assert!(!CheckedIn.can_transition_to(Loaded));
        assert!(!Sorted.can_transition_to(Screening));
        assert!(!Cleared.can_transition_to(Sorted));
    }

    #[test]
    fn any_live_state_can_become_delayed() {
        for s in BagState::ALL {
            if !s.is_terminal() {
                assert!(s.can_transition_to(Delayed));
            }
        }
    }
}
