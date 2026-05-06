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
    
}   


