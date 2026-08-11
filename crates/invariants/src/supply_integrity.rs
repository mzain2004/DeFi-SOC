use crate::Invariant;
use alloy::primitives::{Address, U256};
use shared_types::{InvariantResult, TransactionPayload};
use verification::SimulationResult;

pub struct SupplyIntegrityInvariant {
    pub watched_supply_slots: Vec<(Address, U256)>,
    pub whitelisted_selectors: Vec<[u8; 4]>,
}

impl SupplyIntegrityInvariant {
    pub fn new(
        watched_supply_slots: Vec<(Address, U256)>,
        whitelisted_selectors: Vec<[u8; 4]>,
    ) -> Self {
        Self {
            watched_supply_slots,
            whitelisted_selectors,
        }
    }
}

impl Invariant for SupplyIntegrityInvariant {
    fn name(&self) -> &str {
        "SupplyIntegrityInvariant"
    }

    fn check(&self, sim_result: &SimulationResult, tx: &TransactionPayload) -> InvariantResult {
        let calldata_selector: Option<[u8; 4]> = if tx.calldata.len() >= 4 {
            let mut sel = [0u8; 4];
            sel.copy_from_slice(&tx.calldata[..4]);
            Some(sel)
        } else {
            None
        };

        for change in &sim_result.state_changes {
            let is_supply_slot = self
                .watched_supply_slots
                .iter()
                .any(|(addr, slot)| *addr == change.address && *slot == change.storage_slot);

            if is_supply_slot && change.before != change.after {
                let is_whitelisted = calldata_selector.map_or(false, |sel| {
                    self.whitelisted_selectors.contains(&sel)
                });

                if !is_whitelisted {
                    let sel_hex = calldata_selector
                        .map(|s| format!("0x{}", hex::encode(s)))
                        .unwrap_or_else(|| "none".to_string());
                    return InvariantResult {
                        invariant_name: self.name().to_string(),
                        breached: true,
                        detail: format!(
                            "total supply storage slot {:?} at {:?} mutated (before: {}, after: {}) without whitelisted mint/burn selector (calldata selector: {})",
                            change.storage_slot, change.address, change.before, change.after, sel_hex
                        ),
                    };
                }
            }
        }

        InvariantResult {
            invariant_name: self.name().to_string(),
            breached: false,
            detail: "No supply integrity breach detected".to_string(),
        }
    }
}
