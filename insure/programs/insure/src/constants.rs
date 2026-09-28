use anchor_lang::prelude::*;

pub const DAY: i64 = 24 * 60 * 60;

/// Length of one premium period.
#[constant]
pub const MONTH: i64 = 30 * DAY;

/// How long after `personal_coverage_end` a policy can still be renewed.
#[constant]
pub const GRACE_PERIOD: i64 = 10 * DAY;

/// Anti-spam fee charged when a claim is filed (0.005 USDC). Goes to the treasury.
#[constant]
pub const ORACLE_FEE: u64 = 5_000;

/// Creators can take at most 50% of each premium.
#[constant]
pub const MAX_CREATOR_FEE_BPS: u16 = 5_000;

/// Weather vaults measure rainfall over a trailing window of this many days (max).
#[constant]
pub const MAX_OBSERVATION_DAYS: u16 = 90;

/// Weather claims can be filed up to this long after paid coverage ends; the
/// rainfall window always ends at the coverage end, so no uncovered day counts.
#[constant]
pub const CLAIM_FILING_GRACE: i64 = 7 * DAY;

/// If claims are still pending this long after `vault_expiry` (oracle offline),
/// the creator may withdraw anyway so funds are never locked forever.
#[constant]
pub const FORCE_WITHDRAW_DELAY: i64 = 7 * DAY;

/// Byte offset of `Claim.status` (discriminator 8 + vault 32 + claimant 32 +
/// policy 32 + claim_number 8). Off-chain sweeps filter on it.
#[constant]
pub const CLAIM_STATUS_OFFSET: u64 = 112;

pub const MAX_FLIGHT_NUMBER_LEN: usize = 8;
pub const MIN_FLIGHT_NUMBER_LEN: usize = 3;

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const POLICY_SEED: &[u8] = b"policy";
pub const CLAIM_SEED: &[u8] = b"claim";
