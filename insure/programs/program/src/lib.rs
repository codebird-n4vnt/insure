pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use switchboard_on_demand::prelude::rust_decimal::prelude::ToPrimitive;
use switchboard_on_demand::PullFeedAccountData;

pub use error::*;
pub use state::*;

declare_id!("8c1CfhXgqjKJct4kgoupTHCWk7TnK3MeLjRSV2KqqCsw");

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

        emit!(VaultCreated {
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

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let policy = &mut ctx.accounts.policy;
        let clock = Clock::get()?;
        require!(!vault.is_paused, InsuranceError::VaultPaused);

        require!(
            clock.unix_timestamp >= vault.subscription_start
                && clock.unix_timestamp <= vault.subscription_end,
            InsuranceError::SubscriptionClosed,
        );

        let total_committed = vault
            .total_policies
            .checked_mul(vault.coverage_amount)
            .unwrap();

        require!(
            vault.total_liquidity >= total_committed.checked_add(vault.coverage_amount).unwrap(),
            InsuranceError::InsufficientLiquidity
        );

        policy.vault = vault.key();
        policy.owner = ctx.accounts.owner.key();
        policy.is_subscribed = true;
        policy.personal_coverage_end = 0;
        policy.total_premiums_paid = 0;
        policy.claim_count = 0;
        policy.bump = ctx.bumps.policy;

        Ok(())
    }

    pub const MONTH: i64 = 30 * 24 * 60 * 60;

    pub fn pay_premium(ctx: Context<PayPremium>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let policy = &mut ctx.accounts.policy;
        let clock = Clock::get()?;
        require!(!vault.is_paused, InsuranceError::VaultPaused);

        require!(policy.is_subscribed, InsuranceError::NotSubscribed);
        require!(
            clock.unix_timestamp >= vault.coverage_start
                && clock.unix_timestamp <= vault.coverage_end,
            InsuranceError::OutsideCoverageWindow
        );

        let grace_period: i64 = 10 * 24 * 60 * 60;

        if policy.personal_coverage_end > 0 {
            require!(
                clock.unix_timestamp <= policy.personal_coverage_end + grace_period,
                InsuranceError::CoverageLapsed,
            );
        }

        let creator_fee = (vault.premium_amount as u128)
            .checked_mul(vault.creator_fee_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;
        let treasury_amount = vault.premium_amount.checked_sub(creator_fee).unwrap();

        anchor_spl::token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::TransferChecked {
                    from: ctx.accounts.owner_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault_treasury.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            treasury_amount,
            6,
        )?;
        anchor_spl::token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::TransferChecked {
                    from: ctx.accounts.owner_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.creator_usdc.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            creator_fee,
            6,
        )?;

        if policy.personal_coverage_end == 0 {
            policy.personal_coverage_end = vault.coverage_start + MONTH;
        } else {
            policy.personal_coverage_end = policy.personal_coverage_end.checked_add(MONTH).unwrap();
        }

        if policy.personal_coverage_end > vault.coverage_end {
            policy.personal_coverage_end = vault.coverage_end;
        }

        policy.total_premiums_paid = policy
            .total_premiums_paid
            .checked_add(vault.premium_amount)
            .unwrap();

        vault.total_premiums_collected = vault
            .total_premiums_collected
            .checked_add(vault.premium_amount)
            .unwrap();

        emit!(PremiumPaid {
            vault: vault.key(),
            policy_holder: ctx.accounts.owner.key(),
            amount_paid: vault.premium_amount,
            personal_coverage_end: policy.personal_coverage_end,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }
    
    pub const ORACLE_FEE: u64 = 5_000;

    pub fn raise_claim(ctx: Context<RaiseClaim>, claim_data: ClaimData) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let claimant = ctx.accounts.claimant.key();
        let policy = &mut ctx.accounts.policy;
        let claim = &mut ctx.accounts.claim;
        let clock = Clock::get()?;

        require!(!vault.is_paused, InsuranceError::VaultPaused,);
        require!(
            policy.owner.as_ref() == claimant.as_ref(),
            InsuranceError::Unauthorised,
        );
        require!(policy.is_subscribed, InsuranceError::NotSubscribed);

        require!(
            clock.unix_timestamp <= vault.coverage_end
                && clock.unix_timestamp >= vault.coverage_start
                && clock.unix_timestamp <= policy.personal_coverage_end,
            InsuranceError::OutsideCoverageWindow,
        );

        anchor_spl::token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::TransferChecked{
                    from: ctx.accounts.claimant_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault_treasury.to_account_info(),
                    authority: ctx.accounts.claimant.to_account_info()
                },
            ),
            ORACLE_FEE,
            6
        )?;

        claim.vault = vault.key();
        claim.claimant = claimant;
        claim.filed_at = clock.unix_timestamp;
        claim.settled_at = 0;
        claim.claim_data = claim_data.clone();
        claim.status = ClaimStatus::Pending;
        claim.payout_amount = 0;
        claim.bump = ctx.bumps.claim;
        claim.claim_number = policy.claim_count;

        policy.claim_count = policy.claim_count.checked_add(1).unwrap();

        emit!(ClaimFiled {
        claim:        claim.key(),
        vault:        vault.key(),
        claimant:     ctx.accounts.claimant.key(),
        claim_number: claim.claim_number,
        filed_at:     clock.unix_timestamp,
    });

    Ok(())
    }

    pub fn settle_claim(ctx: Context<SettleClaim>) -> Result<()>{
        let vault = &mut ctx.accounts.vault;
        // let policy = &mut ctx.accounts.policy;
        let claim = &mut ctx.accounts.claim;
        // let claimant_usdc = &mut ctx.accounts.claimant_usdc;
        // let vault_treasury = &mut ctx.accounts.vault_treasury;
        let usdc_mint = &mut ctx.accounts.usdc_mint;
        // let quote_account = &mut ctx.accounts.quote_account;
        let clock = Clock::get()?;

        require!(
            !vault.is_paused,
            InsuranceError::VaultPaused
        );

        require!(
            !(claim.status == ClaimStatus::Approved),
            InsuranceError::ClaimApproved,
        );
        require!(
            !(claim.status == ClaimStatus::Rejected),
            InsuranceError::ClaimRejected,
        );       

        let feed_account_data = ctx.accounts.quote_account.try_borrow_data()?;
        let feed = PullFeedAccountData::parse(feed_account_data).map_err(|_| InsuranceError::InvalidOracleResult)?;
        let value = feed.value(0).map_err(|_| InsuranceError::InvalidOracleResult)?;

        let oracle_value = value.to_i64().ok_or(InsuranceError::InvalidOracleResult)?;

        msg!("Oracle value: {}", oracle_value);

        let approved = oracle_value == 1;
        if approved {
            let vault_authority = vault.authority;
            let vault_bump = vault.bump;
            let seeds = &[b"vault", vault_authority.as_ref(), &[vault_bump]];
            let signer_seeds = &[&seeds[..]];


            anchor_spl::token::transfer_checked(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(), anchor_spl::token::TransferChecked{
                from: ctx.accounts.vault_treasury.to_account_info(),
                mint: usdc_mint.to_account_info(),
                to: ctx.accounts.claimant_usdc.to_account_info(),
                authority: vault.to_account_info()
            }, signer_seeds), vault.coverage_amount, 6)?;

            vault.total_claims_paid = vault.total_claims_paid.checked_add(vault.coverage_amount).unwrap();
            vault.total_liquidity = vault.total_liquidity.checked_sub(vault.coverage_amount).unwrap();

            claim.payout_amount = vault.coverage_amount;
            claim.status = ClaimStatus::Approved;

        } else{
            claim.payout_amount = 0;
            claim.status = ClaimStatus::Rejected;
        }

        claim.settled_at = clock.unix_timestamp;

        emit!(ClaimSettled {
            claim: claim.key(),
            vault: vault.key(),
            claimant: claim.claimant,
            verdict: approved,
            payout_amount: claim.payout_amount,
            oracle_value,
            timestamp: clock.unix_timestamp,
        });

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

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"treasury", vault.key().as_ref()],
        bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    // we will deal with args inside the intialize_vault in a different struct. First we are only creating the vault
}

#[derive(Accounts)]
pub struct RaiseClaim<'info> {
    #[account(mut)]
    claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds=[b"policy", vault.key().as_ref(), claimant.key().as_ref()],
        bump = policy.bump,
        constraint = policy.owner == claimant.key()
            @ InsuranceError::Unauthorised
    )]
    pub policy: Account<'info, PolicyHolder>,
    #[account(
        init,
        payer = claimant,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", vault.key().as_ref(), claimant.key().as_ref(),&policy.claim_count.to_le_bytes()],
        bump
    )]
    pub claim: Account<'info, Claim>,

    #[account(
        mut,
        constraint = claimant_usdc.owner == claimant.key()
            @ InsuranceError::Unauthorised,
        constraint = claimant_usdc.mint == usdc_mint.key()
            @ InsuranceError::InvalidMint
    )]
    pub claimant_usdc: Account<'info, TokenAccount>,

    // oracle fee goes to vault treasury
    #[account(
        mut,
        seeds = [b"treasury", vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,


    pub usdc_mint: Account<'info,Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleClaim<'info>{
    #[account(
        mut,
        seeds = [b"claim", vault.key().as_ref(), claim.claimant.as_ref(), &claim.claim_number.to_le_bytes()],
        bump = claim.bump,
    )]
    pub claim: Account<'info, Claim>,
    
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds=[b"policy", vault.key().as_ref(), policy.owner.as_ref()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, PolicyHolder>,

    #[account(
        mut,
        constraint = claimant_usdc.owner == claim.claimant @ InsuranceError::Unauthorised,
        constraint = claimant_usdc.mint == usdc_mint.key() @ InsuranceError::InvalidMint
    )]
    pub claimant_usdc: Account<'info, TokenAccount>,

    pub quote_account: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"treasury", vault.key().as_ref()],
        bump = vault.treasury_bump
    )]
    pub vault_treasury: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info,Mint>,

    pub token_program: Program<'info, Token>
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = owner,
        space = 8 + PolicyHolder::INIT_SPACE,
        seeds = [
            b"policy",
            vault.key().as_ref(),
            owner.key().as_ref()
        ],
        bump
    )]
    pub policy: Account<'info, PolicyHolder>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayPremium<'info> {
    #[account(
        mut,
        seeds=[b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds=[b"policy", vault.key().as_ref(), owner.key().as_ref()],
        bump = policy.bump,
        constraint = policy.owner == owner.key()
            @ InsuranceError::Unauthorised
    )]
    pub policy: Account<'info, PolicyHolder>,

    #[account(
        mut,
        constraint = owner_usdc.owner == owner.key() @ InsuranceError::Unauthorised,
        constraint = owner_usdc.mint == usdc_mint.key() @ InsuranceError::InvalidMint
    )]
    pub owner_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"treasury", vault.key().as_ref()],
        bump = vault.treasury_bump,
    )]
    pub vault_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_usdc.owner == vault.authority @ InsuranceError::Unauthorised,
        constraint = creator_usdc.mint == usdc_mint.key() @ InsuranceError::InvalidMint
    )]
    pub creator_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
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

#[event]
pub struct PremiumPaid {
    vault: Pubkey,
    policy_holder: Pubkey,
    amount_paid: u64,
    personal_coverage_end: i64,
    timestamp: i64,
}

#[event]
pub struct ClaimFiled {
    pub claim:        Pubkey,
    pub vault:        Pubkey,
    pub claimant:     Pubkey,
    pub claim_number: u64,
    pub filed_at:     i64,
}

#[event]
pub struct ClaimSettled{
    pub claim: Pubkey,
    pub vault: Pubkey,
    pub claimant: Pubkey,
    pub verdict: bool,
    pub payout_amount: u64,
    pub oracle_value: i64,
    pub timestamp: i64,
}