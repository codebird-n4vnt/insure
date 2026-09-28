use anchor_lang::prelude::*;

#[error_code]
pub enum InsuranceError {
    #[msg("The time you entered is invalid")]
    InvalidTimeWindow,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Vault is paused for new subscriptions")]
    VaultPaused,

    #[msg("Vault is closed")]
    VaultClosed,

    #[msg("Subscription is closed right now")]
    SubscriptionClosed,

    #[msg("Insufficient liquidity in the vault to underwrite another policy")]
    InsufficientLiquidity,

    #[msg("Unauthorised access")]
    Unauthorised,

    #[msg("Token mint does not match the vault's mint")]
    InvalidMint,

    #[msg("You are outside the coverage window")]
    OutsideCoverageWindow,

    #[msg("Your insurance coverage has lapsed")]
    CoverageLapsed,

    #[msg("Coverage is already paid up to the end of the vault")]
    AlreadyFullyCovered,

    #[msg("This claim has already been settled")]
    ClaimAlreadySettled,

    #[msg("This policy already has a claim awaiting settlement")]
    ClaimAlreadyPending,

    #[msg("This policy has already received its payout")]
    PolicyAlreadyPaidOut,

    #[msg("Vault is expired")]
    VaultExpired,

    #[msg("Vault money can only be withdrawn after the vault has expired")]
    VaultNotExpired,

    #[msg("Claims are still pending settlement")]
    ClaimsPending,

    #[msg("Creator fee exceeds the allowed maximum")]
    FeeTooHigh,

    #[msg("Trigger threshold is invalid for this trigger type")]
    InvalidThreshold,

    #[msg("Observation window is invalid")]
    InvalidObservationWindow,

    #[msg("Insured risk does not match the vault's trigger type")]
    RiskTypeMismatch,

    #[msg("Latitude or longitude out of range")]
    InvalidCoordinates,

    #[msg("Coverage region is invalid (must be a box at most 10° wide)")]
    InvalidRegion,

    #[msg("This location is outside the vault's coverage region")]
    OutsideRegion,

    #[msg("Flight number must be 3-8 uppercase letters or digits")]
    InvalidFlightNumber,

    #[msg("Flight date must be a UTC midnight inside the coverage window")]
    InvalidFlightDate,

    #[msg("Paid coverage doesn't span a full observation window; renew first")]
    ObservationWindowNotCovered,

    #[msg("It is too early to file this claim")]
    ClaimTooEarly,

    #[msg("This policy can still be renewed or claimed on")]
    PolicyStillActive,

    #[msg("Address cannot be the default (all-zero) key")]
    InvalidAuthority,

    #[msg("Arithmetic overflow")]
    MathOverflow,
}
