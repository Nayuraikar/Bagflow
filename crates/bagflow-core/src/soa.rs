use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

/// Structure-of-arrays bag table. One Vec per field, same length.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct BagSoA {
    pub id: Vec<u32>,
    pub pax: Vec<u32>,
    pub flight: Vec<u32>,
    pub weight_dg: Vec<u16>, // weight in 0.1 kg units
    pub priority: Vec<u8>,
    pub flags: Vec<u8>,
    pub arrival_s: Vec<u32>,  // seconds since midnight
    pub deadline_s: Vec<u32>, // must be loaded by this time
}

impl BagSoA {
    pub fn len(&self) -> usize {
        self.id.len()
    }
    pub fn is_empty(&self) -> bool {
        self.id.is_empty()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn push(&mut self, pax: u32, flight: u32, weight_dg: u16, priority: u8, flags: u8, arrival_s: u32, deadline_s: u32) {
        self.id.push(self.id.len() as u32);
        self.pax.push(pax);
        self.flight.push(flight);
        self.weight_dg.push(weight_dg);
        self.priority.push(priority);
        self.flags.push(flags);
        self.arrival_s.push(arrival_s);
        self.deadline_s.push(deadline_s);
    }

    /// FNV-1a hash over every column. Used to prove two runs are identical.
    pub fn checksum(&self) -> u64 {
        let mut h: u64 = 0xcbf29ce484222325;
        let mut mix = |bytes: &[u8]| {
            for b in bytes {
                h ^= *b as u64;
                h = h.wrapping_mul(0x100000001b3);
            }
        };
        for v in &self.id { mix(&v.to_le_bytes()); }
        for v in &self.pax { mix(&v.to_le_bytes()); }
        for v in &self.flight { mix(&v.to_le_bytes()); }
        for v in &self.weight_dg { mix(&v.to_le_bytes()); }
        for v in &self.priority { mix(&v.to_le_bytes()); }
        for v in &self.flags { mix(&v.to_le_bytes()); }
        for v in &self.arrival_s { mix(&v.to_le_bytes()); }
        for v in &self.deadline_s { mix(&v.to_le_bytes()); }
        h
    }

    /// Binary layout: "BFLW0001", n (u64 LE), then columns in field order, little-endian.
    pub fn write_bin(&self, path: &Path) -> std::io::Result<()> {
        let mut w = BufWriter::new(File::create(path)?);
        w.write_all(b"BFLW0001")?;
        w.write_all(&(self.len() as u64).to_le_bytes())?;
        for v in &self.id { w.write_all(&v.to_le_bytes())?; }
        for v in &self.pax { w.write_all(&v.to_le_bytes())?; }
        for v in &self.flight { w.write_all(&v.to_le_bytes())?; }
        for v in &self.weight_dg { w.write_all(&v.to_le_bytes())?; }
        for v in &self.priority { w.write_all(&v.to_le_bytes())?; }
        for v in &self.flags { w.write_all(&v.to_le_bytes())?; }
        for v in &self.arrival_s { w.write_all(&v.to_le_bytes())?; }
        for v in &self.deadline_s { w.write_all(&v.to_le_bytes())?; }
        w.flush()
    }

    pub fn write_csv(&self, path: &Path, limit: usize) -> std::io::Result<()> {
        let mut w = BufWriter::new(File::create(path)?);
        writeln!(w, "id,pax,flight,weight_kg,priority,flags,arrival_s,deadline_s")?;
        for i in 0..self.len().min(limit) {
            writeln!(
                w,
                "{},{},{},{:.1},{},{},{},{}",
                self.id[i], self.pax[i], self.flight[i],
                self.weight_dg[i] as f32 / 10.0,
                self.priority[i], self.flags[i],
                self.arrival_s[i], self.deadline_s[i]
            )?;
        }
        w.flush()
    }
}
