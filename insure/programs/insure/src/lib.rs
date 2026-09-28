pub mod constants;
pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

pub use constants::*;
pub use error::*;
pub use state::*;

declare_id!("5v7WLSTuZPwfjKWaEvPNfic6sghmnaoup1oxFfbNe4wF");

#[program]
pub mod insure {
    use super::*;

    /// One-time protocol setup. Only the program's upgrade authority can call this,
    /// so nobody can front-run deployment and install their own oracle.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        oracle_authority: Pubkey,
    ) -> Result<()> {
        require!(oracle_authority != Pubkey::default(), InsuranceError::InvalidAuthority);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.authority.key();
        config.oracle_authority = oracle_authority;
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Rotate the oracle key and/or hand over admin rights.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_admin: Pubkey,
        new_oracle_authority: Pubkey,
    ) -> Result<()> {
        require!(
            new_admin != Pubkey::default() && new_oracle_authority != Pubkey::default(),
            InsuranceError::InvalidAuthority
        );
        let config = &mut ctx.accounts.config;
        config.admin = new_admin;
        config.oracle_authority = new_oracle_authority;
        emit!(ConfigUpdated {
            admin: new_admin,
            oracle_authority: new_oracle_authority,
        });
        Ok(())
    }

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_id: u64,
        trigger_type: TriggerType,
        trigger_threshold: i64,
        observation_days: u16,
        region: Region,
        premium_amount: u64,
        coverage_amount: u64,
        subscription_start: i64,
        subscription_end: i64,
        coverage_start: i64,
        coverage_end: i64,
        vault_expiry: i64,
        creator_fee_bps: u16,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(subscription_start >= now, InsuranceError::InvalidTimeWindow);
        require!(subscription_end > subscription_start, InsuranceError::InvalidTimeWindow);
        require!(coverage_start >= subscription_end, InsuranceError::InvalidTimeWindow);
        require!(coverage_end > coverage_start, InsuranceError::InvalidTimeWindow);
        // Leave room to file claims for events at the very end of coverage.
        require!(
            vault_expiry >= coverage_end + CLAIM_FILING_GRACE,
            InsuranceError::InvalidTimeWindow
        );
        require!(premium_amount > 0, InsuranceError::InvalidAmount);
        require!(coverage_amount > premium_amount, InsuranceError::InvalidAmount);
        require!(creator_fee_bps <= MAX_CREATOR_FEE_BPS, InsuranceError::FeeTooHigh);
        require!(trigger_threshold > 0, InsuranceError::InvalidThreshold);

        match trigger_type {
            TriggerType::Weather => {
                require!(
                    observation_days >= 1 && observation_days <= MAX_OBSERVATION_DAYS,
                    InsuranceError::InvalidObservationWindow
                );
                // The rainfall window has to fit inside the coverage period.
                require!(
                    coverage_end - coverage_start >= observation_days as i64 * DAY,
                    InsuranceError::InvalidObservationWindow
                );
                region.validate()?;
            }
            TriggerType::FlightDelay => {
                require!(observation_days == 0, InsuranceError::InvalidObservationWindow);
                require!(region == Region::default(), InsuranceError::InvalidRegion);
                // A delay longer than 3 days isn't a delay product any more.
                require!(trigger_threshold <= 3 * 24 * 60, InsuranceError::InvalidThreshold);
            }
        }

        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.vault_id = vault_id;
        vault.usdc_mint = ctx.accounts.usdc_mint.key();
        vault.bump = ctx.bumps.vault;
        vault.treasury_bump = ctx.bumps.vault_treasury;
        vault.trigger_type = trigger_type;
        vault.trigger_threshold = trigger_threshold;
        vault.observation_days = observation_days;
        vault.region = region;
        vault.premium_amount = premium_amount;
        vault.coverage_amount = coverage_amount;
        vault.creator_fee_bps = creator_fee_bps;
        vault.subscription_start = subscription_start;
        vault.subscription_end = subscription_end;
        vault.coverage_start = coverage_start;
        vault.coverage_end = coverage_end;
        vault.vault_expiry = vault_expiry;
        vault.total_liquidity = 0;
        vault.creator_fees_accrued = 0;
        vault.total_premiums_collected = 0;
        vault.total_claims_paid = 0;
        vault.total_policies = 0;
        vault.active_policies = 0;
        vault.total_claims = 0;
        vault.pending_claims = 0;
        vault.is_paused = false;
        vault.is_closed = false;

        emit!(VaultCreated {
            vault: vault.key(),
            authority: vault.authority,
            trigger_type,
            trigger_threshold,
            coverage_start,
            coverage_end,
            premium_amount,
            coverage_amount,
            timestamp: now,
        });
        Ok(())
    }

    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, InsuranceError::InvalidAmount);
        require!(!ctx.accounts.vault.is_closed, InsuranceError::VaultClosed);
        require!(now < ctx.accounts.vault.coverage_end, InsuranceError::VaultExpired);

        transfer_in(
            &ctx.accounts.token_program,
            &ctx.accounts.creator_usdc,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.creator,
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.total_liquidity = vault
            .total_liquidity
            .checked_add(amount)
            .ok_or(InsuranceError::MathOverflow)?;

        emit!(LiquidityDeposited {
            vault: vault.key(),
            amount,
            total_liquidity: vault.total_liquidity,
        });
        Ok(())
    }

    /// Withdraw capital that isn't backing any policy. Exposure stays fully collateralised.
    pub fn withdraw_excess_liquidity(ctx: Context<CreatorTreasuryAction>, amount: u64) -> Result<()> {
        require!(amount > 0, InsuranceError::InvalidAmount);
        let vault = &ctx.accounts.vault;
        require!(!vault.is_closed, InsuranceError::VaultClosed);
        let free = vault
            .total_liquidity
            .checked_sub(vault.committed_liquidity()?)
            .ok_or(InsuranceError::InsufficientLiquidity)?;
        require!(amount <= free, InsuranceError::InsufficientLiquidity);

        transfer_out(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.creator_usdc,
            vault,
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.total_liquidity -= amount;
        emit!(LiquidityWithdrawn {
            vault: vault.key(),
            amount,
            total_liquidity: vault.total_liquidity,
        });
        Ok(())
    }

    pub fn claim_creator_fees(ctx: Context<CreatorTreasuryAction>) -> Result<()> {
        let amount = ctx.accounts.vault.creator_fees_accrued;
        require!(amount > 0, InsuranceError::InvalidAmount);
        require!(!ctx.accounts.vault.is_closed, InsuranceError::VaultClosed);

        transfer_out(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.creator_usdc,
            &ctx.accounts.vault,
            amount,
        )?;
        ctx.accounts.vault.creator_fees_accrued = 0;
        Ok(())
    }

    /// Pausing only stops new subscriptions. Existing policyholders can always
    /// renew and get their claims settled, so a creator can't pause their way out of a payout.
    pub fn set_vault_paused(ctx: Context<SetVaultPaused>, paused: bool) -> Result<()> {
        ctx.accounts.vault.is_paused = paused;
        Ok(())
    }

    /// Buy a policy: registers the insured risk and pays the first premium atomically,
    /// so capacity can't be squatted by free subscriptions.
    pub fn subscribe(ctx: Context<Subscribe>, risk: InsuredRisk) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault = &ctx.accounts.vault;

        require!(!vault.is_closed, InsuranceError::VaultClosed);
        require!(!vault.is_paused, InsuranceError::VaultPaused);
        require!(
            now >= vault.subscription_start && now <= vault.subscription_end,
            InsuranceError::SubscriptionClosed
        );
        risk.validate(vault)?;

        let needed = vault
            .committed_liquidity()?
            .checked_add(vault.coverage_amount)
            .ok_or(InsuranceError::MathOverflow)?;
        require!(vault.total_liquidity >= needed, InsuranceError::InsufficientLiquidity);

        let premium = vault.premium_amount;
        let fee = vault.creator_fee(premium)?;
        transfer_in(
            &ctx.accounts.token_program,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.owner,
            premium,
        )?;

        let covered_from = vault.coverage_start;
        let personal_coverage_end = match vault.trigger_type {
            // Flight policies are single-premium: one flight, covered for the whole window.
            TriggerType::FlightDelay => vault.coverage_end,
            TriggerType::Weather => (vault.coverage_start + MONTH).min(vault.coverage_end),
        };

        let policy = &mut ctx.accounts.policy;
        policy.vault = vault.key();
        policy.owner = ctx.accounts.owner.key();
        policy.risk = risk;
        policy.covered_from = covered_from;
        policy.personal_coverage_end = personal_coverage_end;
        policy.total_premiums_paid = premium;
        policy.claim_count = 0;
        policy.has_pending_claim = false;
        policy.paid_out = false;
        policy.bump = ctx.bumps.policy;
        policy.released = false;

        let vault = &mut ctx.accounts.vault;
        vault.total_policies = vault.total_policies.checked_add(1).ok_or(InsuranceError::MathOverflow)?;
        vault.active_policies = vault.active_policies.checked_add(1).ok_or(InsuranceError::MathOverflow)?;
        vault.total_premiums_collected = vault
            .total_premiums_collected
            .checked_add(premium)
            .ok_or(InsuranceError::MathOverflow)?;
        vault.creator_fees_accrued = vault
            .creator_fees_accrued
            .checked_add(fee)
            .ok_or(InsuranceError::MathOverflow)?;

        emit!(PolicyPurchased {
            vault: vault.key(),
            policy: ctx.accounts.policy.key(),
            owner: ctx.accounts.owner.key(),
            personal_coverage_end,
            timestamp: now,
        });
        Ok(())
    }

    /// Renew a weather policy for another month.
    pub fn pay_premium(ctx: Context<PayPremium>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault = &ctx.accounts.vault;
        let policy = &ctx.accounts.policy;

        require!(!vault.is_closed, InsuranceError::VaultClosed);
        require!(!policy.paid_out, InsuranceError::PolicyAlreadyPaidOut);
        require!(!policy.released, InsuranceError::CoverageLapsed);
        require!(now <= vault.coverage_end, InsuranceError::OutsideCoverageWindow);
        require!(
            policy.personal_coverage_end < vault.coverage_end,
            InsuranceError::AlreadyFullyCovered
        );
        require!(
            now <= policy.personal_coverage_end + GRACE_PERIOD,
            InsuranceError::CoverageLapsed
        );

        let premium = vault.premium_amount;
        let fee = vault.creator_fee(premium)?;
        transfer_in(
            &ctx.accounts.token_program,
            &ctx.accounts.owner_usdc,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.owner,
            premium,
        )?;

        let new_end = policy
            .personal_coverage_end
            .checked_add(MONTH)
            .ok_or(InsuranceError::MathOverflow)?
            .min(vault.coverage_end);

        let policy = &mut ctx.accounts.policy;
        policy.personal_coverage_end = new_end;
        policy.total_premiums_paid = policy
            .total_premiums_paid
            .checked_add(premium)
            .ok_or(InsuranceError::MathOverflow)?;

        let vault = &mut ctx.accounts.vault;
        vault.total_premiums_collected = vault
            .total_premiums_collected
            .checked_add(premium)
            .ok_or(InsuranceError::MathOverflow)?;
        vault.creator_fees_accrued = vault
            .creator_fees_accrued
            .checked_add(fee)
            .ok_or(InsuranceError::MathOverflow)?;

        emit!(PremiumPaid {
            vault: vault.key(),
            policy_holder: ctx.accounts.owner.key(),
            amount_paid: premium,
            personal_coverage_end: new_end,
            timestamp: now,
        });
        Ok(())
    }

    /// File a claim against the policy's own insured risk. The oracle picks it up
    /// from the `ClaimFiled` event (or by polling) and settles it.
    pub fn raise_claim(ctx: Context<RaiseClaim>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault = &ctx.accounts.vault;
        let policy = &ctx.accounts.policy;

        require!(!vault.is_closed, InsuranceError::VaultClosed);
        require!(!policy.paid_out, InsuranceError::PolicyAlreadyPaidOut);
        require!(!policy.has_pending_claim, InsuranceError::ClaimAlreadyPending);
        require!(!policy.released, InsuranceError::CoverageLapsed);
        require!(now >= vault.coverage_start, InsuranceError::OutsideCoverageWindow);

        match &policy.risk {
            InsuredRisk::Weather { .. } => {
                // The oracle measures the `observation_days` before
                // min(filed_at, covered_until); that whole window must be paid for.
                let window_end = policy.covered_from + vault.observation_days as i64 * DAY;
                let covered_until = policy.personal_coverage_end.min(vault.coverage_end);
                require!(now >= window_end, InsuranceError::ClaimTooEarly);
                require!(covered_until >= window_end, InsuranceError::ObservationWindowNotCovered);
                require!(
                    now <= covered_until + CLAIM_FILING_GRACE && now < vault.vault_expiry,
                    InsuranceError::OutsideCoverageWindow
                );
            }
            InsuredRisk::FlightDelay { flight_date, .. } => {
                require!(
                    *flight_date >= policy.covered_from && *flight_date <= policy.personal_coverage_end,
                    InsuranceError::OutsideCoverageWindow
                );
                require!(now >= *flight_date, InsuranceError::ClaimTooEarly);
                require!(now < vault.vault_expiry, InsuranceError::VaultExpired);
            }
        }

        transfer_in(
            &ctx.accounts.token_program,
            &ctx.accounts.claimant_usdc,
            &ctx.accounts.usdc_mint,
            &ctx.accounts.vault_treasury,
            &ctx.accounts.claimant,
            ORACLE_FEE,
        )?;

        let claim_number = policy.claim_count;
        let claim = &mut ctx.accounts.claim;
        claim.vault = vault.key();
        claim.claimant = ctx.accounts.claimant.key();
        claim.policy = policy.key();
        claim.claim_number = claim_number;
        claim.risk = policy.risk.clone();
        claim.filed_at = now;
        claim.settled_at = 0;
        claim.status = ClaimStatus::Pending;
        claim.payout_amount = 0;
        claim.observed_value = 0;
        claim.evidence_hash = [0u8; 32];
        claim.bump = ctx.bumps.claim;

        let policy = &mut ctx.accounts.policy;
        policy.claim_count = policy.claim_count.checked_add(1).ok_or(InsuranceError::MathOverflow)?;
        policy.has_pending_claim = true;

        let vault = &mut ctx.accounts.vault;
        vault.total_claims = vault.total_claims.checked_add(1).ok_or(InsuranceError::MathOverflow)?;
        vault.pending_claims = vault.pending_claims.checked_add(1).ok_or(InsuranceError::MathOverflow)?;

        emit!(ClaimFiled {
            claim: ctx.accounts.claim.key(),
            vault: vault.key(),
            claimant: ctx.accounts.claimant.key(),
            claim_number,
            filed_at: now,
        });
        Ok(())
    }

    /// Only the configured oracle can settle. The verdict, the measured value and a
    /// hash of the evidence are recorded on-chain so anyone can audit the decision.
    pub fn settle_claim(
        ctx: Context<SettleClaim>,
        approved: bool,
        observed_value: i64,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.claim.status == ClaimStatus::Pending,
            InsuranceError::ClaimAlreadySettled
        );

        let payout = if approved {
            let vault = &ctx.accounts.vault;
            require!(!vault.is_closed, InsuranceError::VaultClosed);
            require!(!ctx.accounts.policy.paid_out, InsuranceError::PolicyAlreadyPaidOut);
            let amount = vault.coverage_amount;
            transfer_out(
                &ctx.accounts.token_program,
                &ctx.accounts.vault_treasury,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.claimant_usdc,
                vault,
                amount,
            )?;
            amount
        } else {
            0
        };

        let vault = &mut ctx.accounts.vault;
        vault.pending_claims = vault.pending_claims.saturating_sub(1);
        if approved {
            vault.total_liquidity = vault
                .total_liquidity
                .checked_sub(payout)
                .ok_or(InsuranceError::InsufficientLiquidity)?;
            vault.total_claims_paid = vault
                .total_claims_paid
                .checked_add(payout)
                .ok_or(InsuranceError::MathOverflow)?;
            vault.active_policies = vault.active_policies.saturating_sub(1);
        }

        let policy = &mut ctx.accounts.policy;
        policy.has_pending_claim = false;
        if approved {
            policy.paid_out = true;
        }

        let claim = &mut ctx.accounts.claim;
        claim.status = if approved { ClaimStatus::Approved } else { ClaimStatus::Rejected };
        claim.payout_amount = payout;
        claim.observed_value = observed_value;
        claim.evidence_hash = evidence_hash;
        claim.settled_at = now;

        emit!(ClaimSettled {
            claim: claim.key(),
            vault: vault.key(),
            claimant: claim.claimant,
            approved,
            payout_amount: payout,
            observed_value,
            evidence_hash,
            timestamp: now,
        });
        Ok(())
    }

    /// Frees the capital backing a weather policy that can no longer be renewed or
    /// claimed on (its owner stopped paying). Permissionless: the conditions alone
    /// guarantee no legitimate claim is cut off, and underwriters get their
    /// capacity back without waiting for the vault to expire.
    pub fn release_lapsed_policy(ctx: Context<ReleaseLapsedPolicy>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault = &ctx.accounts.vault;
        let policy = &ctx.accounts.policy;

        require!(!vault.is_closed, InsuranceError::VaultClosed);
        require!(
            matches!(policy.risk, InsuredRisk::Weather { .. })
                && !policy.paid_out
                && !policy.released
                && !policy.has_pending_claim,
            InsuranceError::PolicyStillActive
        );
        let covered_until = policy.personal_coverage_end.min(vault.coverage_end);
        require!(
            now > policy.personal_coverage_end + GRACE_PERIOD && now > covered_until + CLAIM_FILING_GRACE,
            InsuranceError::PolicyStillActive
        );

        ctx.accounts.policy.released = true;
        let vault = &mut ctx.accounts.vault;
        vault.active_policies = vault.active_policies.saturating_sub(1);

        emit!(PolicyReleased {
            vault: vault.key(),
            policy: ctx.accounts.policy.key(),
            active_policies: vault.active_policies,
        });
        Ok(())
    }

    /// After expiry the creator takes back everything left in the treasury.
    /// Blocked while claims are pending, unless the oracle has been silent for
    /// FORCE_WITHDRAW_DELAY past expiry.
    pub fn creator_withdraw(ctx: Context<CreatorTreasuryAction>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let vault = &ctx.accounts.vault;
        require!(!vault.is_closed, InsuranceError::VaultClosed);
        require!(now >= vault.vault_expiry, InsuranceError::VaultNotExpired);
        require!(
            vault.pending_claims == 0 || now >= vault.vault_expiry + FORCE_WITHDRAW_DELAY,
            InsuranceError::ClaimsPending
        );

        let amount = ctx.accounts.vault_treasury.amount;
        if amount > 0 {
            transfer_out(
                &ctx.accounts.token_program,
                &ctx.accounts.vault_treasury,
                &ctx.accounts.usdc_mint,
                &ctx.accounts.creator_usdc,
                vault,
                amount,
            )?;
        }

        let vault = &mut ctx.accounts.vault;
        vault.total_liquidity = 0;
        vault.creator_fees_accrued = 0;
        vault.active_policies = 0;
        vault.is_paused = true;
        vault.is_closed = true;

        emit!(VaultClosed {
            vault: vault.key(),
            creator: vault.authority,
            amount_withdrawn: amount,
        });
        Ok(())
    }
}

// ─── token helpers ─────────────────────────────────────────────────────────

fn transfer_in<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    to: &Account<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )
}

fn transfer_out<'info>(
    token_program: &Program<'info, Token>,
    treasury: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    to: &Account<'info, TokenAccount>,
    vault: &Account<'info, Vault>,
    amount: u64,
) -> Result<()> {
    let vault_id = vault.vault_id.to_le_bytes();
    let seeds: &[&[u8]] = &[VAULT_SEED, vault.authority.as_ref(), &vault_id, &[vault.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: treasury.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

// ─── accounts ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::Insure>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ InsuranceError::Unauthorised
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ InsuranceError::Unauthorised
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.usdc_mint @ InsuranceError::InvalidMint)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, authority.key().as_ref(), &vault_id.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
        constraint = vault.authority == creator.key() @ InsuranceError::Unauthorised,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = creator,
    )]
    pub creator_usdc: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

/// Shared by withdraw_excess_liquidity, claim_creator_fees and creator_withdraw.
#[derive(Accounts)]
pub struct CreatorTreasuryAction<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
        constraint = vault.authority == creator.key() @ InsuranceError::Unauthorised,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = creator,
    )]
    pub creator_usdc: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetVaultPaused<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.authority == creator.key() @ InsuranceError::Unauthorised,
    )]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = owner,
        space = 8 + PolicyHolder::INIT_SPACE,
        seeds = [POLICY_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub policy: Box<Account<'info, PolicyHolder>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Box<Account<'info, TokenAccount>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayPremium<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [POLICY_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump = policy.bump,
        has_one = owner @ InsuranceError::Unauthorised,
        has_one = vault,
    )]
    pub policy: Account<'info, PolicyHolder>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = owner,
    )]
    pub owner_usdc: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RaiseClaim<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [POLICY_SEED, vault.key().as_ref(), claimant.key().as_ref()],
        bump = policy.bump,
        constraint = policy.owner == claimant.key() @ InsuranceError::Unauthorised,
        has_one = vault,
    )]
    pub policy: Box<Account<'info, PolicyHolder>>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Claim::INIT_SPACE,
        seeds = [
            CLAIM_SEED,
            vault.key().as_ref(),
            claimant.key().as_ref(),
            &policy.claim_count.to_le_bytes()
        ],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = claimant,
    )]
    pub claimant_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Box<Account<'info, TokenAccount>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseLapsedPolicy<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [POLICY_SEED, vault.key().as_ref(), policy.owner.as_ref()],
        bump = policy.bump,
        has_one = vault,
    )]
    pub policy: Account<'info, PolicyHolder>,
}

#[derive(Accounts)]
pub struct SettleClaim<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.oracle_authority == oracle.key() @ InsuranceError::Unauthorised,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        has_one = usdc_mint @ InsuranceError::InvalidMint,
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [POLICY_SEED, vault.key().as_ref(), claim.claimant.as_ref()],
        bump = policy.bump,
        has_one = vault,
    )]
    pub policy: Box<Account<'info, PolicyHolder>>,
    #[account(
        mut,
        seeds = [
            CLAIM_SEED,
            vault.key().as_ref(),
            claim.claimant.as_ref(),
            &claim.claim_number.to_le_bytes()
        ],
        bump = claim.bump,
        has_one = vault,
        has_one = policy,
    )]
    pub claim: Box<Account<'info, Claim>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: only used as the ATA authority; pinned to the claim's claimant.
    #[account(address = claim.claimant @ InsuranceError::Unauthorised)]
    pub claimant: UncheckedAccount<'info>,
    /// Created if the claimant closed their USDC account, so a payout can't be blocked.
    #[account(
        init_if_needed,
        payer = oracle,
        associated_token::mint = usdc_mint,
        associated_token::authority = claimant,
    )]
    pub claimant_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ─── events ────────────────────────────────────────────────────────────────

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub oracle_authority: Pubkey,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub trigger_type: TriggerType,
    pub trigger_threshold: i64,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub premium_amount: u64,
    pub coverage_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityDeposited {
    pub vault: Pubkey,
    pub amount: u64,
    pub total_liquidity: u64,
}

#[event]
pub struct LiquidityWithdrawn {
    pub vault: Pubkey,
    pub amount: u64,
    pub total_liquidity: u64,
}

#[event]
pub struct PolicyPurchased {
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub owner: Pubkey,
    pub personal_coverage_end: i64,
    pub timestamp: i64,
}

#[event]
pub struct PremiumPaid {
    pub vault: Pubkey,
    pub policy_holder: Pubkey,
    pub amount_paid: u64,
    pub personal_coverage_end: i64,
    pub timestamp: i64,
}

#[event]
pub struct PolicyReleased {
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub active_policies: u64,
}

#[event]
pub struct ClaimFiled {
    pub claim: Pubkey,
    pub vault: Pubkey,
    pub claimant: Pubkey,
    pub claim_number: u64,
    pub filed_at: i64,
}

#[event]
pub struct ClaimSettled {
    pub claim: Pubkey,
    pub vault: Pubkey,
    pub claimant: Pubkey,
    pub approved: bool,
    pub payout_amount: u64,
    pub observed_value: i64,
    pub evidence_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub creator: Pubkey,
    pub amount_withdrawn: u64,
}
