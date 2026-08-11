use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Compute lowercase hex SHA-256 payload hash of raw bytes.
pub fn compute_payload_hash(raw_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw_bytes);
    hex::encode(hasher.finalize())
}

/// Compute HMAC-SHA256 signature for approval_id, nonce, payload_hash using secret.
/// Wire message format: `{approval_id}:{nonce}:{payload_hash}`
pub fn compute_hmac(approval_id: &str, nonce: &str, payload_hash: &str, secret: &str) -> String {
    let message = format!("{}:{}:{}", approval_id, nonce, payload_hash);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Verify HMAC-SHA256 signature using constant-time comparison via the `subtle` crate.
/// Security-critical: Prevents timing attacks when checking untrusted signatures.
pub fn verify_signature(
    approval_id: &str,
    nonce: &str,
    payload_hash: &str,
    secret: &str,
    signature: &str,
) -> bool {
    let expected_sig = compute_hmac(approval_id, nonce, payload_hash, secret);

    let expected_bytes = expected_sig.as_bytes();
    let sig_bytes = signature.as_bytes();

    if expected_bytes.len() != sig_bytes.len() {
        return false;
    }

    expected_bytes.ct_eq(sig_bytes).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_payload_hash() {
        let data = b"hello defi soc";
        let hash = compute_payload_hash(data);
        assert_eq!(
            hash,
            "3b24389c62a4327a23502a8d364ef900fbe8ff16fcf87d78a841d40ed1a684a9"
        );
    }

    #[test]
    fn test_hmac_computation_and_verification_roundtrip() {
        let approval_id = "auto-12345";
        let nonce = "b81e4b86-77e8-4a5c-9c02-99033a8e9e12";
        let payload_hash = "1c068cf0cfb6391d4e0e5a87fb25f7ee7ae53930b80ef8a099a22f3604f5ee35";
        let secret = "super-secret-hmac-key-placeholder";

        let sig = compute_hmac(approval_id, nonce, payload_hash, secret);
        assert!(!sig.is_empty());
        assert_eq!(sig.len(), 64);

        let valid = verify_signature(approval_id, nonce, payload_hash, secret, &sig);
        assert!(valid);
    }

    #[test]
    fn test_tampered_signature_fails() {
        let approval_id = "auto-12345";
        let nonce = "b81e4b86-77e8-4a5c-9c02-99033a8e9e12";
        let payload_hash = "1c068cf0cfb6391d4e0e5a87fb25f7ee7ae53930b80ef8a099a22f3604f5ee35";
        let secret = "super-secret-hmac-key-placeholder";

        let sig = compute_hmac(approval_id, nonce, payload_hash, secret);

        // Tamper signature string
        let mut tampered_sig = sig.clone();
        if tampered_sig.ends_with('0') {
            tampered_sig.pop();
            tampered_sig.push('1');
        } else {
            tampered_sig.pop();
            tampered_sig.push('0');
        }

        assert!(!verify_signature(
            approval_id,
            nonce,
            payload_hash,
            secret,
            &tampered_sig
        ));
    }

    #[test]
    fn test_tampered_message_fails() {
        let approval_id = "auto-12345";
        let nonce = "b81e4b86-77e8-4a5c-9c02-99033a8e9e12";
        let payload_hash = "1c068cf0cfb6391d4e0e5a87fb25f7ee7ae53930b80ef8a099a22f3604f5ee35";
        let secret = "super-secret-hmac-key-placeholder";

        let sig = compute_hmac(approval_id, nonce, payload_hash, secret);

        // Wrong nonce
        assert!(!verify_signature(
            approval_id,
            "wrong-nonce",
            payload_hash,
            secret,
            &sig
        ));
        // Wrong approval_id
        assert!(!verify_signature(
            "wrong-approval",
            nonce,
            payload_hash,
            secret,
            &sig
        ));
        // Wrong payload_hash
        assert!(!verify_signature(
            approval_id,
            nonce,
            "wronghash",
            secret,
            &sig
        ));
        // Wrong secret
        assert!(!verify_signature(
            approval_id,
            nonce,
            payload_hash,
            "wrong-secret",
            &sig
        ));
    }
}
