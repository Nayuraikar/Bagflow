//! Parser for the saved kernel and MPI result files. Every row it produces is static:
//! measured earlier, on the machine named in the row.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct Row {
    #[serde(rename = "static")]
    pub is_static: bool,
    pub machine: String,
    pub source_file: String,
    /// "kernel" or "mpi".
    pub kind: &'static str,
    /// The row name exactly as the file prints it (MPI: the mode).
    pub label: String,
    pub bags: u64,
    pub statistic: &'static str,
    // kernel rows
    pub time_ms: Option<f64>,
    pub million_bags_per_s: Option<f64>,
    pub gb_per_s: Option<f64>,
    pub speedup: Option<f64>,
    pub speedup_baseline: &'static str,
    pub copy_in_ms: Option<f64>,
    pub copy_out_ms: Option<f64>,
    // MPI rows
    pub ranks: Option<u32>,
    pub load_ms: Option<f64>,
    pub compute_ms: Option<f64>,
    pub reduce_ms: Option<f64>,
    pub compute_speedup: Option<f64>,
    pub end_to_end_speedup: Option<f64>,
    /// `None` where the file prints no check on that line or its group.
    pub output_identical: Option<bool>,
}

/// File name and, where the file itself does not name the machine, the machine
/// recorded in docs/AUDIT.md section 2.5.
const FILES: [(&str, Option<&str>); 5] = [
    ("kernels_10M_kaggle.txt", None),
    ("kernels_10M_metal.txt", Some("Apple M1")),
    ("mpi_10M.txt", Some("Apple M1")),
    ("mpi_50M.txt", Some("Apple M1")),
    ("mpi_50M_kaggle.txt", None),
];

pub fn load(results_dir: &Path) -> Result<Vec<Row>, String> {
    let mut rows = Vec::new();
    for (file, machine) in FILES {
        let text = std::fs::read_to_string(results_dir.join(file)).map_err(|e| format!("{file}: {e}"))?;
        let parsed = if file.starts_with("mpi_") {
            parse_mpi(file, &text, machine)
        } else {
            parse_kernels(file, &text, machine)
        }
        .map_err(|e| format!("{file}: {e}"))?;
        rows.extend(parsed);
    }
    Ok(rows)
}

fn blank(machine: &str, file: &str, kind: &'static str, label: String, bags: u64) -> Row {
    Row {
        is_static: true,
        machine: machine.to_string(),
        source_file: format!("results/{file}"),
        kind,
        label,
        bags,
        statistic: "best of 10",
        time_ms: None,
        million_bags_per_s: None,
        gb_per_s: None,
        speedup: None,
        speedup_baseline: "",
        copy_in_ms: None,
        copy_out_ms: None,
        ranks: None,
        load_ms: None,
        compute_ms: None,
        reduce_ms: None,
        compute_speedup: None,
        end_to_end_speedup: None,
        output_identical: None,
    }
}

fn identical(word: &str) -> Option<bool> {
    match word {
        "identical" => Some(true),
        "MISMATCH" => Some(false),
        _ => None,
    }
}

fn ratio(word: &str) -> Option<f64> {
    word.strip_suffix('x')?.parse().ok()
}

/// `<name...> <time> <M bags/s> <GB/s> <speedup>x [identical|MISMATCH]`
fn kernel_line(line: &str) -> Option<(String, [f64; 4], Option<bool>)> {
    let mut words: Vec<&str> = line.split_whitespace().collect();
    let check = words.last().and_then(|w| identical(w));
    if check.is_some() {
        words.pop();
    }
    let k = words.len().checked_sub(4)?;
    if k == 0 {
        return None;
    }
    let nums = [words[k].parse().ok()?, words[k + 1].parse().ok()?, words[k + 2].parse().ok()?, ratio(words[k + 3])?];
    Some((words[..k].join(" "), nums, check))
}

/// `copy in A ms, copy out [+ reduce] B ms, output identical`
fn copy_line(line: &str) -> Option<(f64, f64, Option<bool>)> {
    let rest = line.trim().strip_prefix("copy in ")?;
    let (copy_in, rest) = rest.split_once(" ms, copy out ")?;
    let (copy_out, check) = rest.split_once(" ms, output ")?;
    let copy_out = copy_out.split_whitespace().last()?;
    Some((copy_in.parse().ok()?, copy_out.parse().ok()?, identical(check.trim())))
}

fn parse_kernels(file: &str, text: &str, machine: Option<&str>) -> Result<Vec<Row>, String> {
    let header = text.lines().next().ok_or("empty file")?;
    let bags: u64 = header
        .strip_prefix("deadline-risk kernel: ")
        .and_then(|r| r.split_whitespace().next())
        .and_then(|w| w.parse().ok())
        .ok_or("no bag count in the first line")?;
    // an annotated header ends "best of 10 (<machine>)"
    let annotated = header.split_once("best of 10 (").and_then(|(_, r)| r.strip_suffix(')'));
    let machine = annotated.or(machine).ok_or("machine unknown")?;

    let mut rows: Vec<Row> = Vec::new();
    let mut gpu_from: Option<usize> = None; // first row of the GPU group still waiting for its copy line
    for line in text.lines().skip(1) {
        if let Some((label, [time, mbags, gbs, speedup], check)) = kernel_line(line) {
            let is_gpu = label.starts_with("metal") || label.starts_with("cuda");
            if is_gpu && gpu_from.is_none() {
                gpu_from = Some(rows.len());
            }
            let mut r = blank(machine, file, "kernel", label, bags);
            r.time_ms = Some(time);
            r.million_bags_per_s = Some(mbags);
            r.gb_per_s = Some(gbs);
            r.speedup = Some(speedup);
            r.speedup_baseline = "scalar in the same file";
            r.output_identical = check;
            rows.push(r);
        } else if let Some((copy_in, copy_out, check)) = copy_line(line) {
            let from = gpu_from.take().ok_or("copy line with no GPU rows before it")?;
            for r in rows[from..].iter_mut().filter(|r| r.label.starts_with("metal") || r.label.starts_with("cuda")) {
                r.copy_in_ms = Some(copy_in);
                r.copy_out_ms = Some(copy_out);
                r.output_identical = check;
            }
        } else if line.trim_end().ends_with("identical") || line.trim_end().ends_with("MISMATCH") {
            return Err(format!("unparsed result line: {line}"));
        }
    }
    if rows.is_empty() {
        return Err("no result rows".into());
    }
    Ok(rows)
}

fn parse_mpi(file: &str, text: &str, machine: Option<&str>) -> Result<Vec<Row>, String> {
    let first = text.lines().next().ok_or("empty file")?;
    // an annotated file starts with a line naming the machine, before the column header
    let machine = if first.starts_with("mode") {
        machine.ok_or("machine unknown")?
    } else {
        first.trim()
    };
    // the three class counts on the last line add up to the bag count
    let bags: u64 = text
        .lines()
        .find_map(|l| l.split_once("slack sum = "))
        .and_then(|(_, r)| r.split_whitespace().take(3).map(|w| w.parse::<u64>().ok()).sum::<Option<u64>>())
        .ok_or("no class counts line")?;

    let mut rows = Vec::new();
    for line in text.lines() {
        let w: Vec<&str> = line.split_whitespace().collect();
        if !matches!(w.first(), Some(&"read") | Some(&"scatter")) {
            continue;
        }
        let parsed = (|| {
            if w.len() != 8 {
                return None;
            }
            let mut r = blank(machine, file, "mpi", w[0].to_string(), bags);
            r.ranks = Some(w[1].parse().ok()?);
            r.load_ms = Some(w[2].parse().ok()?);
            r.compute_ms = Some(w[3].parse().ok()?);
            r.reduce_ms = Some(w[4].parse().ok()?);
            r.compute_speedup = Some(ratio(w[5])?);
            r.end_to_end_speedup = Some(ratio(w[6])?);
            r.speedup_baseline = "1 rank, same mode, same file";
            r.statistic = "compute: best of 10; load: measured once";
            r.output_identical = Some(identical(w[7])?);
            Some(r)
        })();
        rows.push(parsed.ok_or_else(|| format!("unparsed MPI line: {line}"))?);
    }
    if rows.is_empty() {
        return Err("no result rows".into());
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all() -> Vec<Row> {
        load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../results")).unwrap()
    }

    #[test]
    fn parses_every_row_of_every_file() {
        let rows = all();
        let count = |f: &str| rows.iter().filter(|r| r.source_file == format!("results/{f}")).count();
        assert_eq!(count("kernels_10M_kaggle.txt"), 16);
        assert_eq!(count("kernels_10M_metal.txt"), 15);
        assert_eq!(count("mpi_10M.txt"), 8);
        assert_eq!(count("mpi_50M.txt"), 8);
        assert_eq!(count("mpi_50M_kaggle.txt"), 6);
        assert!(rows.iter().all(|r| r.is_static && !r.machine.is_empty() && r.output_identical == Some(true)));
    }

    #[test]
    fn values_match_the_files() {
        let rows = all();
        let find = |f: &str, label: &str| {
            rows.iter().find(|r| r.source_file.ends_with(f) && r.label == label).unwrap().clone()
        };
        let neon = find("kernels_10M_metal.txt", "rayon-4+neon");
        assert_eq!((neon.time_ms, neon.speedup, neon.bags), (Some(1.89), Some(7.47), 10_000_168));
        assert_eq!(neon.machine, "Apple M1");
        assert_eq!(neon.copy_in_ms, None);

        let metal = find("kernels_10M_metal.txt", "metal + copy in/out");
        assert_eq!((metal.time_ms, metal.copy_in_ms, metal.copy_out_ms), (Some(7.41), Some(3.01), Some(0.26)));

        let cuda = find("kernels_10M_kaggle.txt", "cuda warp shuffle + PCIe");
        assert_eq!((cuda.time_ms, cuda.copy_in_ms, cuda.copy_out_ms), (Some(21.61), Some(18.71), Some(2.02)));
        assert!(cuda.machine.starts_with("Kaggle") && cuda.machine.contains("Tesla T4"));

        let mpi = rows.iter().find(|r| r.source_file.ends_with("mpi_50M_kaggle.txt") && r.label == "scatter" && r.ranks == Some(4)).unwrap();
        assert_eq!((mpi.load_ms, mpi.compute_ms, mpi.bags), (Some(855.8), Some(25.90), 50_000_099));
        assert!(mpi.machine.starts_with("Kaggle"));
    }
}
