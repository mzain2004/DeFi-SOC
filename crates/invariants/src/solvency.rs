use crate::Invariant;
use alloy::primitives::U256;
use shared_types::{InvariantResult, TransactionPayload};
use verification::SimulationResult;

pub struct SolvencyInvariant {
    pub threshold_pct: f64,
}

impl SolvencyInvariant {
    pub fn new(threshold_pct: f64) -> Self {
        Self { threshold_pct }
    }

    pub fn default_threshold() -> Self {
        Self::new(10.0)
    }
}

fn u256_to_f64(val: U256) -> f64 {
    if let Ok(num) = val.try_into() {
        let n: u128 = num;
        n as f64
    } else {
        val.to_string().parse::<f64>().unwrap_or(0.0)
    }
}

impl Invariant for SolvencyInvariant {
    fn name(&self) -> &str {
        "SolvencyInvariant"
    }

    fn check(&self, sim_result: &SimulationResult, _tx: &TransactionPayload) -> InvariantResult {
        for change in &sim_result.state_changes {
            if change.before > U256::ZERO && change.after < change.before {
                let diff = change.before - change.after;
                let before_f = u256_to_f64(change.before);
                let diff_f = u256_to_f64(diff);

                if before_f > 0.0 {
                    let drop_pct = (diff_f / before_f) * 100.0;
                    if drop_pct >= self.threshold_pct {
                        return InvariantResult {
                            invariant_name: self.name().to_string(),
                            breached: true,
                            detail: format!(
                                "vault/address {:?} balance dropped {:.2}% in single block (before: {}, after: {}), threshold is {:.2}%",
                                change.address, drop_pct, change.before, change.after, self.threshold_pct
                            ),
                        };
                    }
                }
            }
        }

        InvariantResult {
            invariant_name: self.name().to_string(),
            breached: false,
            detail: "No solvency breach detected".to_string(),
        }
    }
}
