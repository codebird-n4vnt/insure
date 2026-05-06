pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub use error::*;
pub use state::*;

declare_id!("5DkAk2HYyi7XDXGJpXnZuvEu7n9CLEXEFMNFnTGkjzTo");

#[program]
pub mod insure {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<Initialize>,
        trigger_type: TriggerType,
        trigger_threshold: i64,
        premium_amount: u64,
        coverage_amount: u64,
        subscription_start: i64,
        subscription_end: i64,
        coverage_start: i64,
        coverage_end: i64,
        vault_expiry: i64,
        creator_fee_bps: u16,
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            subscription_start > clock.unix_timestamp,
            InsuranceError::InvalidTimeWindow,
        );

        require!(
            subscription_end > subscription_start,
            InsuranceError::InvalidTimeWindow,
        );
        require!(
            subscription_end < coverage_start,
            InsuranceError::InvalidTimeWindow,
        );
        require!(
            coverage_end > coverage_start,
            InsuranceError::InvalidTimeWindow,
        );
        require!(
            coverage_end < vault_expiry,
            InsuranceError::InvalidTimeWindow,
        );
        require!(premium_amount > 0, InsuranceError::InvalidAmount,);
        require!(coverage_amount > 0, InsuranceError::InvalidAmount);

        let vault = &mut ctx.accounts.vault;

        vault.authority = ctx.accounts.authority.key();
        vault.bump = ctx.bumps.vault;
        vault.trigger_threshold = trigger_threshold;
        vault.trigger_type = trigger_type;
        vault.subscription_end = subscription_end;
        vault.subscription_start = subscription_start;
        vault.coverage_end = coverage_end;
        vault.coverage_start = coverage_start;
        vault.coverage_amount = coverage_amount;
        vault.premium_amount = premium_amount;
        vault.creator_fee_bps = creator_fee_bps;
        vault.vault_expiry = vault_expiry;
        vault.total_premiums_collected = 0;
        vault.total_claims_paid = 0;
        vault.total_liquidity = 0;
        vault.is_paused = false;
        vault.total_policies = 0;
        vault.total_claims = 0;

        emit!(VaultCreated{
            vault: vault.key(),
            authority: ctx.accounts.authority.key(),
            trigger_type: vault.trigger_type.clone(),
            coverage_start: vault.coverage_start,
            coverage_end: vault.coverage_end,
            premium_amount: vault.premium_amount,
            coverage_amount: vault.coverage_amount,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }

    pub fn buy_premium(ctx: Context<BuyPremium>) -> Result<()> {

        let vault = &mut ctx.accounts.vault;
        let policy = & mut ctx.accounts.policy_holder;
        let clock = Clock::get()?;
        
        require!(
            clock.unix_timestamp <= vault.subscription_end && clock.unix_timestamp >=vault.subscription_start,
            InsuranceError::SubscriptionClosed
        );
        require!(
            !vault.is_paused,
            InsuranceError::VaultPaused,
        );

        require!(
            !policy.is_active,
            InsuranceError::AlreadySubscribed
        );
        require!(
            vault.total_liquidity >= vault.total_claims_paid + vault.coverage_amount,
            InsuranceError::InsufficientLiquidity
        );
        Ok(())
    }

    pub fn raise_claim(ctx: Context<RaiseClaim>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )] // first we need to initialize.
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
    // we will deal with args inside the intialize_vault in a different struct. First we are only creating the vault
}

#[derive(Accounts)]
pub struct RaiseClaim<'info> {
    #[account(mut)]
    claimant: Signer<'info>,
    #[account(mut)]
    vault: Account<'info, Vault>,
    #[account(mut)]
    policy: Account<'info, PolicyHolder>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", vault.key().as_ref(), claimant.key().as_ref(),&policy.claim_count.to_le_bytes()],
        bump
    )]
    pub claim: Account<'info, Claim>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyPremium<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PolicyHolder::INIT_SPACE,
        seeds = [b"premium", vault.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub policy_holder: Account<'info, PolicyHolder>,

    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    // this is the for the owner's usdc account ( amount will be debited from here )
    #[account(
        mut,
        constraint = owner_usdc.owner == owner.key(),
        constraint = owner_usdc.mint == usdc_mint.key(),
    )]
    pub owner_usdc : Account<'info, TokenAccount>,

    // vault's USDC treasury ( amount credited here )
    #[account(
        mut,
        constraint = vault_treasury.owner == vault.key()
    )]
    pub vault_treasury: Account<'info,TokenAccount>,

    #[account(
        mut,
        constraint = creator_usdc.owner == vault.authority
    )]
    pub creator_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}






// EVENTS
#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub trigger_type: TriggerType,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub premium_amount: u64,
    pub coverage_amount: u64,
    pub timestamp: i64,
}