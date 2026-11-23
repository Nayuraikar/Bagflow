use serde::{Deserialize, Serialize};

/// Bag priority classes (stored as u8 in the SoA).
pub const PRIO_STANDARD: u8 = 0;
pub const PRIO_PRIORITY: u8 = 1;
pub const PRIO_TIGHT: u8 = 2;

/// Bit flags stored in the `flags` column.
pub const FLAG_TRANSFER: u8 = 0b0000_0001;
pub const FLAG_SPECIAL: u8 = 0b0000_0010; // oversize / fragile

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeKind {
    CheckIn,
    Identification,
    Screening,
    Conveyor,
    Sorter,
    Transfer,
    Loading,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: u16,
    pub kind: NodeKind,
    pub servers: u16,        // parallel service channels
    pub mean_service_ms: u32,
    pub queue_capacity: u32,
    pub x: f32,              // layout coordinates for the UI
    pub y: f32,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub from: u16,
    pub to: u16,
    pub travel_ms: u32,
    pub capacity_per_min: u32,
    pub online: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Flight {
    pub id: u32,
    pub departure_s: u32, // seconds since midnight
    pub seats: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Scenario {
    Normal,
    PeakSurge,
    ConveyorFailure,
    ScreeningDelay,
    ConnectingRush,
    SorterOverload,
}
