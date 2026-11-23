use bagflow_core::queueing::run_case;

fn main() {
    let n = 1_000_000;
    println!("M/M/c validation: {n} customers per case, mean service 100 s, seed 42\n");
    println!("{:<4}{:>6}{:>14}{:>12}{:>9}{:>10}{:>9}", "c", "rho", "Wq theory s", "Wq sim s", "error", "util sim", "result");
    let mut fails = 0;
    for c in [1u32, 2, 4, 8, 16] {
        for rho in [0.5, 0.7, 0.8] {
            let r = run_case(42, c, rho, n);
            let ok = r.err.abs() < 0.05 && (r.util_sim - rho).abs() < 0.02 && r.completed as usize == n;
            if !ok {
                fails += 1;
            }
            println!("{:<4}{:>6.2}{:>14.2}{:>12.2}{:>8.2}%{:>9.1}%{:>9}",
                c, rho, r.wq_theory, r.wq_sim, r.err * 100.0, r.util_sim * 100.0, if ok { "PASS" } else { "FAIL" });
        }
    }
    println!("\n{} of 15 cases within 5% of theory", 15 - fails);
}
