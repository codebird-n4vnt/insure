use anchor_lang::prelude::*;


#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy)]
pub enum TriggerType {
    Weather,
    FlightDelay,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub trigger_type: TriggerType,
    pub trigger_threshold: i64,
    pub premium_amount: u64,
    pub coverage_amount: u64,
    pub total_premiums_collected: u64,
    pub total_claims_paid: u64,
    pub creator_fee_bps: u16,
    pub total_liquidity: u64,
    pub is_paused: bool,
    pub bump: u8,
    // all the times are unix_timestamp
    pub subscription_start: i64,   // when farmers can start buying
    pub subscription_end: i64,     // last day to buy coverage
    pub coverage_start: i64,       // when claims become valid
    pub coverage_end: i64,         // when claims stop being valid
    pub vault_expiry: i64,         // when vault fully closes + creator withdraws

    pub total_policies:u64,
    pub total_claims:u64,
    pub treasury_bump:u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
#[derive(InitSpace)]
pub enum ClaimStatus {
    Pending,
    OracleQueried,
    Approved,
    Rejected,
    Paid,
}

#[account]
#[derive(InitSpace)]
pub struct PolicyHolder {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub total_premiums_paid: u64,
    pub personal_coverage_end: i64,
    pub is_subscribed: bool,
    pub claim_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub index: u64,
    pub vault: Pubkey,
    pub claimant: Pubkey,
    pub claim_time: i64,
    pub status: ClaimStatus,
    pub payout_amount: u64,
    pub bump: u8,
    pub claim_data: ClaimData,
}

#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
#[derive(InitSpace)]
pub enum ClaimData {
    Weather {
        latitude: f64,
        longitude: f64
    },
    
    FlightDelay{
        #[max_len(20)]
        flight_number: String,
        flight_date: i64,
    }

}