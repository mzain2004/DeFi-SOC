use crate::Invariant;
use alloy::primitives::{Address, U256};
use shared_types::{InvariantResult, TransactionPayload};
use verification::SimulationResult;

pub struct OracleBoundInvariant {
    pub watched_slots: Vec<(Address, U256)>,
    pub max_change_pct: f64,
}

impl OracleBoundInvariant {
    pub fn new(watched_slots: Vec<(Address, U256)>, max_change_pct: f64) -> Self {
        Self {
            watched_slots,
            max_change_pct,
        }
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

impl Invariant for OracleBoundInvariant {
    fn name(&self) -> &str {
        "OracleBoundInvariant"
    }

    fn check(&self, sim_result: &SimulationResult, _tx: &TransactionPayload) -> InvariantResult {
        for change in &sim_result.state_changes {
            let is_watched = self
                .watched_slots
                .iter()
                .any(|(addr, slot)| *addr == change.address && *slot == change.storage_slot);

            if is_watched {
                let before_f = u256_to_f64(change.before);
                let after_f = u256_to_f64(change.after);

                if before_f > 0.0 {
                    let diff_f = (after_f - before_f).abs();
                    let change_pct = (diff_f / before_f) * 100.0;

                    if change_pct >= self.max_change_pct {
                        return InvariantResult {
                            invariant_name: self.name().to_string(),
                            breached: true,
                            detail: format!(
                                "oracle storage slot {:?} at address {:?} changed by {:.2}% (before: {}, after: {}), max threshold is {:.2}%",
                                change.storage_slot, change.address, change_pct, change.before, change.after, self.max_change_pct
                            ),
                        };
                    }
                }
            }
        }

        InvariantResult {
            invariant_name: self.name().to_string(),
            breached: false,
            detail: "No oracle bound breach detected".to_string(),
        }
    }
}
