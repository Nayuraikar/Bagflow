use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;

/// Named random streams. Each gets its own ChaCha stream so adding a new
/// random draw in one place never shifts numbers in another.
#[derive(Clone, Copy, Debug)]
#[repr(u64)]
pub enum Stream {
    Flights = 1,
    Bags = 2,
    Screening = 3,
    Failures = 4,
    Routing = 5,
}

pub fn stream_rng(master: u64, stream: Stream) -> ChaCha8Rng {
    let mut r = ChaCha8Rng::seed_from_u64(master);
    r.set_stream(stream as u64);
    r
}

/// One independent stream per (stream kind, flight). Order of generation
/// (sequential or parallel) cannot change the result.
pub fn flight_rng(master: u64, stream: Stream, flight_id: u32) -> ChaCha8Rng {
    let mut r = ChaCha8Rng::seed_from_u64(master);
    r.set_stream(((stream as u64) << 32) | flight_id as u64);
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;

    #[test]
    fn same_seed_same_numbers() {
        let a: u64 = stream_rng(42, Stream::Bags).gen();
        let b: u64 = stream_rng(42, Stream::Bags).gen();
        assert_eq!(a, b);
    }

    #[test]
    fn streams_differ() {
        let a: u64 = stream_rng(42, Stream::Bags).gen();
        let b: u64 = stream_rng(42, Stream::Flights).gen();
        assert_ne!(a, b);
    }

    #[test]
    fn flight_streams_differ() {
        let a: u64 = flight_rng(42, Stream::Bags, 1).gen();
        let b: u64 = flight_rng(42, Stream::Bags, 2).gen();
        assert_ne!(a, b);
    }
}
