use anchor_lang::prelude::*;

#[error_code]
pub enum InsuranceError {
    #[msg("The time you entered is invalid!")]
    InvalidTimeWindow,

    #[msg("Invalid amount!")]
    InvalidAmount,

    #[msg("Vault is paused")]
    VaultPaused,

    #[msg("Subscription is closed right now")] SubscriptionClosed,

    #[msg("You already have subscribed for this insurance")] AlreadySubscribed,

    #[msg("Insufficient liquidity in the vault, please check after after hours")] InsufficientLiquidity,

    #[msg("Unauthorised access")] Unauthorised,

    #[msg("Provided USDC mint address is different from what was stored")] InvalidMint,
    
    #[msg("Not subscribed")] NotSubscribed,

    #[msg("You are trying to pay premium outside the coverage window")] OutsideCoverageWindow,

    #[msg("Your insurance coverage is lapsed, please buy any other premium")] CoverageLapsed,

    #[msg("This claim was already approved")] ClaimApproved,

    #[msg("This claim was rejected")] ClaimRejected,

    #[msg("Invalid oracle result")] InvalidOracleResult,

    #[msg("Vault is expired")] VaultExpired,

    #[msg("Vault money can only be withdrawn after the vault has expired")] VaultNotExpired,
}   


