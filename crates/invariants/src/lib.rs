pub mod oracle_bound;
pub mod solvency;
pub mod supply_integrity;

pub use oracle_bound::OracleBoundInvariant;
pub use solvency::SolvencyInvariant;
pub use supply_integrity::SupplyIntegrityInvariant;

use shared_types::{InvariantResult, TransactionPayload};
use verification::SimulationResult;

pub trait Invariant {
    fn name(&self) -> &str;
    fn check(&self, sim_result: &SimulationResult, tx: &TransactionPayload) -> InvariantResult;
}

/// Runs a collection of invariants against a simulation result and transaction payload.
pub fn run_invariants(
    invariants: &[Box<dyn Invariant>],
    sim_result: &SimulationResult,
    tx: &TransactionPayload,
) -> Vec<InvariantResult> {
    invariants
        .iter()
        .map(|inv| inv.check(sim_result, tx))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, bytes, Address, U256};
    use verification::StateChange;

    fn sample_tx(calldata: Vec<u8>) -> TransactionPayload {
        TransactionPayload {
            hash: None,
            from: address!("0000000000000000000000000000000000000001"),
            to: Some(address!("0000000000000000000000000000000000000002")),
            calldata: calldata.into(),
            value: U256::ZERO,
            gas_limit: U256::from(100000),
            gas_price: None,
            nonce: 1,
        }
    }

    #[test]
    fn test_solvency_invariant_breach() {
        let inv = SolvencyInvariant::new(10.0);
        let sim = SimulationResult {
            success: true,
            state_changes: vec![StateChange {
                address: address!("0000000000000000000000000000000000000002"),
                storage_slot: U256::ZERO,
                before: U256::from(100),
                after: U256::from(80), // 20% drop -> breach (> 10%)
            }],
            revert_reason: None,
            gas_used: 50000,
        };
        let tx = sample_tx(vec![]);

        let res = inv.check(&sim, &tx);
        assert!(res.breached);
        assert_eq!(res.invariant_name, "SolvencyInvariant");
    }

    #[test]
    fn test_solvency_invariant_no_breach() {
        let inv = SolvencyInvariant::new(10.0);
        let sim = SimulationResult {
            success: true,
            state_changes: vec![StateChange {
                address: address!("0000000000000000000000000000000000000002"),
                storage_slot: U256::ZERO,
                before: U256::from(100),
                after: U256::from(95), // 5% drop -> no breach (< 10%)
            }],
            revert_reason: None,
            gas_used: 50000,
        };
        let tx = sample_tx(vec![]);

        let res = inv.check(&sim, &tx);
        assert!(!res.breached);
    }

    #[test]
    fn test_oracle_bound_invariant() {
        let target_addr = address!("0000000000000000000000000000000000000002");
        let target_slot = U256::from(5);

        let inv = OracleBoundInvariant::new(vec![(target_addr, target_slot)], 5.0);
        let sim = SimulationResult {
            success: true,
            state_changes: vec![StateChange {
                address: target_addr,
                storage_slot: target_slot,
                before: U256::from(1000),
                after: U256::from(1100), // 10% change -> breach (> 5%)
            }],
            revert_reason: None,
            gas_used: 50000,
        };
        let tx = sample_tx(vec![]);

        let res = inv.check(&sim, &tx);
        assert!(res.breached);
    }

    #[test]
    fn test_supply_integrity_invariant() {
        let token_addr = address!("0000000000000000000000000000000000000002");
        let supply_slot = U256::from(2);
        let mint_selector = [0x40, 0xc1, 0x0f, 0x19];

        let inv = SupplyIntegrityInvariant::new(
            vec![(token_addr, supply_slot)],
            vec![mint_selector],
        );

        // Case 1: unwhitelisted calldata selector -> breach
        let sim = SimulationResult {
            success: true,
            state_changes: vec![StateChange {
                address: token_addr,
                storage_slot: supply_slot,
                before: U256::from(1000),
                after: U256::from(2000),
            }],
            revert_reason: None,
            gas_used: 50000,
        };
        let tx_unwhitelisted = sample_tx(vec![0x12, 0x34, 0x56, 0x78]);
        assert!(inv.check(&sim, &tx_unwhitelisted).breached);

        // Case 2: whitelisted selector -> no breach
        let tx_whitelisted = sample_tx(mint_selector.to_vec());
        assert!(!inv.check(&sim, &tx_whitelisted).breached);
    }
}
