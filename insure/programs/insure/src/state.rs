use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::InsuranceError;

/// Protocol-wide settings. Created once by the program's upgrade authority.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// The only key allowed to settle claims.
    pub oracle_authority: Pubkey,
    /// The only mint vaults may be denominated in (USDC).
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TriggerType {
    /// Pays out if rainfall over `observation_days` is below `trigger_threshold` (in mm).
    Weather,
    /// Pays out if the insured flight is cancelled or arrives `trigger_threshold`+ minutes late.
    FlightDelay,
}

/// Weather vaults only insure farms inside this box, so a policy priced for one
/// climate can't be bought for a much drier one. Micro-degrees; all zero for flight vaults.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Region {
    pub min_lat_e6: i32,
    pub max_lat_e6: i32,
    pub min_lon_e6: i32,
    pub max_lon_e6: i32,
}

impl Region {
    /// ~10° ≈ 1,100 km: wider than that and one price can't fit the climate.
    pub const MAX_SPAN_E6: i32 = 10_000_000;

    pub fn validate(&self) -> Result<()> {
        require!(
            -90_000_000 <= self.min_lat_e6
                && self.min_lat_e6 < self.max_lat_e6
                && self.max_lat_e6 <= 90_000_000
                && -180_000_000 <= self.min_lon_e6
                && self.min_lon_e6 < self.max_lon_e6
                && self.max_lon_e6 <= 180_000_000,
            InsuranceError::InvalidRegion
        );
        require!(
            self.max_lat_e6 - self.min_lat_e6 <= Self::MAX_SPAN_E6
                && self.max_lon_e6 - self.min_lon_e6 <= Self::MAX_SPAN_E6,
            InsuranceError::InvalidRegion
        );
        Ok(())
    }

    pub fn contains(&self, lat_e6: i32, lon_e6: i32) -> bool {
        (self.min_lat_e6..=self.max_lat_e6).contains(&lat_e6) && (self.min_lon_e6..=self.max_lon_e6).contains(&lon_e6)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub vault_id: u64,
    pub usdc_mint: Pubkey,
    pub bump: u8,
    pub treasury_bump: u8,

    pub trigger_type: TriggerType,
    pub trigger_threshold: i64,
    /// Weather only: length of the trailing rainfall window, in days.
    pub observation_days: u16,
    /// Weather only: where insured farms may be.
    pub region: Region,

    pub premium_amount: u64,
    pub coverage_amount: u64,
    pub creator_fee_bps: u16,

    // all times are unix timestamps
    pub subscription_start: i64,
    pub subscription_end: i64,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub vault_expiry: i64,

    /// Creator capital backing the policies (deposits − payouts − excess withdrawals).
    pub total_liquidity: u64,
    /// Creator fees sitting in the treasury that the creator hasn't collected yet.
    pub creator_fees_accrued: u64,
    pub total_premiums_collected: u64,
    pub total_claims_paid: u64,

    pub total_policies: u64,
    /// Policies that can still be paid out. `active_policies * coverage_amount`
    /// is the vault's outstanding exposure and must stay <= `total_liquidity`.
    pub active_policies: u64,
    pub total_claims: u64,
    pub pending_claims: u64,

    /// Blocks new subscriptions only; never blocks renewals or claim settlement.
    pub is_paused: bool,
    /// Set once the creator has withdrawn after expiry.
    pub is_closed: bool,
}

impl Vault {
    pub fn committed_liquidity(&self) -> Result<u64> {
        self.active_policies
            .checked_mul(self.coverage_amount)
            .ok_or_else(|| error!(InsuranceError::MathOverflow))
    }

    pub fn creator_fee(&self, premium: u64) -> Result<u64> {
        let fee = (premium as u128)
            .checked_mul(self.creator_fee_bps as u128)
            .ok_or(InsuranceError::MathOverflow)?
            / 10_000;
        Ok(fee as u64)
    }
}

/// The thing a policy insures. Fixed at subscription time so a claimant
/// can't pick whichever location or flight happened to have a bad day.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, PartialEq, Debug)]
pub enum InsuredRisk {
    Weather {
        /// Degrees × 1e6
        latitude_e6: i32,
        /// Degrees × 1e6
        longitude_e6: i32,
    },
    FlightDelay {
        /// IATA flight number, e.g. "AI101"
        #[max_len(8)]
        flight_number: String,
        /// UTC midnight of the scheduled departure date
        flight_date: i64,
    },
}

impl InsuredRisk {
    pub fn validate(&self, vault: &Vault) -> Result<()> {
        match self {
            InsuredRisk::Weather { latitude_e6, longitude_e6 } => {
                require!(vault.trigger_type == TriggerType::Weather, InsuranceError::RiskTypeMismatch);
                require!(
                    (-90_000_000..=90_000_000).contains(latitude_e6)
                        && (-180_000_000..=180_000_000).contains(longitude_e6),
                    InsuranceError::InvalidCoordinates
                );
                require!(vault.region.contains(*latitude_e6, *longitude_e6), InsuranceError::OutsideRegion);
            }
            InsuredRisk::FlightDelay { flight_number, flight_date } => {
                require!(vault.trigger_type == TriggerType::FlightDelay, InsuranceError::RiskTypeMismatch);
                require!(
                    (MIN_FLIGHT_NUMBER_LEN..=MAX_FLIGHT_NUMBER_LEN).contains(&flight_number.len())
                        && flight_number
                            .bytes()
                            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()),
                    InsuranceError::InvalidFlightNumber
                );
                require!(
                    flight_date % DAY == 0
                        && *flight_date >= vault.coverage_start
                        && *flight_date <= vault.coverage_end,
                    InsuranceError::InvalidFlightDate
                );
            }
        }
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct PolicyHolder {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub risk: InsuredRisk,
    /// When coverage began (first premium or coverage_start, whichever is later).
    pub covered_from: i64,
    pub personal_coverage_end: i64,
    pub total_premiums_paid: u64,
    pub claim_count: u64,
    pub has_pending_claim: bool,
    pub paid_out: bool,
    pub bump: u8,
    /// Set by `release_lapsed_policy` once every renewal and claim window has
    /// closed; its payout no longer counts against the vault's capacity.
    pub released: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ClaimStatus {
    Pending,
    Approved,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub vault: Pubkey,
    pub claimant: Pubkey,
    pub policy: Pubkey,
    pub claim_number: u64,
    /// Kept before the variable-length `risk` so it sits at a fixed offset
    /// (CLAIM_STATUS_OFFSET) and indexers can filter pending claims with memcmp.
    pub status: ClaimStatus,
    /// Snapshot of the policy's insured risk at filing time.
    pub risk: InsuredRisk,
    pub filed_at: i64,
    pub settled_at: i64,
    pub payout_amount: u64,
    /// Measured value the oracle decided on: rainfall in 0.1 mm, or delay in minutes
    /// (-1 = cancelled). 0 while pending.
    pub observed_value: i64,
    /// sha256 of the oracle's evidence bundle (raw API data + reasoning), served by the keeper.
    pub evidence_hash: [u8; 32],
    pub bump: u8,
}
