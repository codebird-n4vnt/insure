use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Custom error message")]
    CustomError,
}

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
}   


