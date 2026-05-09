use anchor_lang::{
    prelude::Pubkey,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_instruction,
        system_program,
    },
    AnchorDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
// Use Pack from spl_token's own solana_program — same version as Mint/Account implement
use spl_token::solana_program::program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

// ─── helpers ───────────────────────────────────────────────────────────────

fn program_id() -> Pubkey {
    insure::id()
}

fn send(
    svm: &mut LiteSVM,
    ix: Instruction,
    signers: &[&Keypair],
) -> litesvm::types::TransactionResult {
    let payer = signers[0].pubkey();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &bh);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

fn send_batch(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> litesvm::types::TransactionResult {
    let payer = signers[0].pubkey();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer), &bh);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<solana_clock::Clock>().unix_timestamp
}

fn get_rent(svm: &LiteSVM) -> solana_rent::Rent {
    svm.get_sysvar::<solana_rent::Rent>()
}

/// Read and deserialize an Anchor account (skips 8-byte discriminator).
fn read_account<T: AnchorDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).expect("account not found");
    T::deserialize(&mut &acc.data[8..]).expect("deserialize failed")
}

// Convert a spl_token instruction (uses its own solana_program re-export)
// into an anchor Instruction via byte conversion – safe across crate-version seams.
fn wrap_spl(raw: spl_token::solana_program::instruction::Instruction) -> Instruction {
    Instruction {
        program_id: Pubkey::from(raw.program_id.to_bytes()),
        accounts: raw
            .accounts
            .into_iter()
            .map(|a| AccountMeta {
                pubkey: Pubkey::from(a.pubkey.to_bytes()),
                is_signer: a.is_signer,
                is_writable: a.is_writable,
            })
            .collect(),
        data: raw.data,
    }
}

fn spl_id() -> Pubkey {
    Pubkey::from(spl_token::id().to_bytes())
}

fn to_spl(pk: &Pubkey) -> spl_token::solana_program::pubkey::Pubkey {
    spl_token::solana_program::pubkey::Pubkey::from(pk.to_bytes())
}

// ─── SPL mint / ATA setup ──────────────────────────────────────────────────

const MINT_LEN: usize = spl_token::state::Mint::LEN;
const ATA_LEN: usize  = spl_token::state::Account::LEN;

fn create_bare_mint(svm: &mut LiteSVM, payer: &Keypair) -> Keypair {
    let mint = Keypair::new();
    let rent = get_rent(svm);
    let ixs = [
        system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            rent.minimum_balance(MINT_LEN),
            MINT_LEN as u64,
            &spl_id(),
        ),
        wrap_spl(
            spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &to_spl(&mint.pubkey()),
                &to_spl(&payer.pubkey()),
                None,
                6,
            )
            .unwrap(),
        ),
    ];
    send_batch(svm, &ixs, &[payer, &mint]).unwrap();
    mint
}

fn create_usdc_mint_and_ata(
    svm: &mut LiteSVM,
    payer: &Keypair,
    owner: &Pubkey,
    decimals: u8,
    amount: u64,
) -> (Pubkey, Pubkey) {
    let mint = Keypair::new();
    let ata  = Keypair::new();
    let rent = get_rent(svm);

    let ixs = [
        system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            rent.minimum_balance(MINT_LEN),
            MINT_LEN as u64,
            &spl_id(),
        ),
        wrap_spl(
            spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &to_spl(&mint.pubkey()),
                &to_spl(&payer.pubkey()),
                None,
                decimals,
            )
            .unwrap(),
        ),
        system_instruction::create_account(
            &payer.pubkey(),
            &ata.pubkey(),
            rent.minimum_balance(ATA_LEN),
            ATA_LEN as u64,
            &spl_id(),
        ),
        wrap_spl(
            spl_token::instruction::initialize_account(
                &spl_token::id(),
                &to_spl(&ata.pubkey()),
                &to_spl(&mint.pubkey()),
                &to_spl(owner),
            )
            .unwrap(),
        ),
        wrap_spl(
            spl_token::instruction::mint_to(
                &spl_token::id(),
                &to_spl(&mint.pubkey()),
                &to_spl(&ata.pubkey()),
                &to_spl(&payer.pubkey()),
                &[],
                amount,
            )
            .unwrap(),
        ),
    ];
    send_batch(svm, &ixs, &[payer, &mint, &ata]).unwrap();
    (mint.pubkey(), ata.pubkey())
}

// ─── PDA helpers ───────────────────────────────────────────────────────────

fn vault_pdas(authority: &Pubkey) -> (Pubkey, u8, Pubkey) {
    let (vault, bump) =
        Pubkey::find_program_address(&[b"vault", authority.as_ref()], &program_id());
    let (treasury, _) =
        Pubkey::find_program_address(&[b"treasury", vault.as_ref()], &program_id());
    (vault, bump, treasury)
}

fn policy_pda(vault: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"policy", vault.as_ref(), owner.as_ref()],
        &program_id(),
    )
}

fn claim_pda(vault: &Pubkey, claimant: &Pubkey, claim_count: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"claim", vault.as_ref(), claimant.as_ref(), &claim_count.to_le_bytes()],
        &program_id(),
    )
}

// ─── Program setup ─────────────────────────────────────────────────────────

fn setup(keypairs: &[&Keypair]) -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/insure.so");
    svm.add_program(program_id(), bytes).unwrap();
    for kp in keypairs {
        svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    }
    svm
}

// ─── Instruction builders ──────────────────────────────────────────────────

fn ix_initialize_vault(
    authority: &Pubkey,
    vault: &Pubkey,
    treasury: &Pubkey,
    mint: &Pubkey,
    args: &insure::instruction::InitializeVault,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: insure::accounts::Initialize {
            authority: *authority,
            vault: *vault,
            vault_treasury: *treasury,
            usdc_mint: *mint,
            token_program: anchor_spl::token::ID,
            system_program: system_program::ID,
            rent: Pubkey::from(spl_token::solana_program::sysvar::rent::ID.to_bytes()),
        }
        .to_account_metas(None),
        data: args.data(),
    }
}

fn default_vault_args(now: i64) -> insure::instruction::InitializeVault {
    insure::instruction::InitializeVault {
        trigger_type: insure::state::TriggerType::Weather,
        trigger_threshold: 100,
        premium_amount: 1_000_000,
        coverage_amount: 10_000_000,
        subscription_start: now + 60,
        subscription_end: now + 120,
        coverage_start: now + 180,
        coverage_end: now + 3600,
        vault_expiry: now + 7200,
        creator_fee_bps: 500,
    }
}

fn init_vault(svm: &mut LiteSVM, authority: &Keypair, mint: &Pubkey, now: i64) -> (Pubkey, Pubkey) {
    let (vault, _, treasury) = vault_pdas(&authority.pubkey());
    let args = insure::instruction::InitializeVault {
        trigger_type: insure::state::TriggerType::Weather,
        trigger_threshold: 100,
        premium_amount: 1_000_000,
        coverage_amount: 10_000_000,
        subscription_start: now + 10,
        subscription_end: now + 200,
        coverage_start: now + 300,
        coverage_end: now + 3600,
        vault_expiry: now + 7200,
        creator_fee_bps: 500,
    };
    let ix = ix_initialize_vault(&authority.pubkey(), &vault, &treasury, mint, &args);
    send(svm, ix, &[authority]).unwrap();
    (vault, treasury)
}

// ─── initialize_vault tests ────────────────────────────────────────────────

#[test]
fn test_initialize_vault_success() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);
    let mint = create_bare_mint(&mut svm, &authority);
    let (vault, _, treasury) = vault_pdas(&authority.pubkey());
    let t = now(&svm);

    let args = default_vault_args(t);
    let ix = ix_initialize_vault(&authority.pubkey(), &vault, &treasury, &mint.pubkey(), &args);
    let res = send(&mut svm, ix, &[&authority]);
    assert!(res.is_ok(), "initialize_vault should succeed: {:?}", res.err());

    let v: insure::state::Vault = read_account(&svm, &vault);
    assert_eq!(v.authority, authority.pubkey());
    assert_eq!(v.premium_amount, 1_000_000);
    assert_eq!(v.coverage_amount, 10_000_000);
    assert!(!v.is_paused);
    assert_eq!(v.total_policies, 0);
    assert_eq!(v.total_premiums_collected, 0);
}

#[test]
fn test_initialize_vault_subscription_start_in_past_fails() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);
    let mint = create_bare_mint(&mut svm, &authority);
    let (vault, _, treasury) = vault_pdas(&authority.pubkey());
    let t = now(&svm);

    let mut args = default_vault_args(t);
    args.subscription_start = t - 10; // in the past

    let ix = ix_initialize_vault(&authority.pubkey(), &vault, &treasury, &mint.pubkey(), &args);
    let res = send(&mut svm, ix, &[&authority]);
    assert!(res.is_err(), "should fail with InvalidTimeWindow");
}

#[test]
fn test_initialize_vault_zero_premium_fails() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);
    let mint = create_bare_mint(&mut svm, &authority);
    let (vault, _, treasury) = vault_pdas(&authority.pubkey());
    let t = now(&svm);

    let mut args = default_vault_args(t);
    args.premium_amount = 0;

    let ix = ix_initialize_vault(&authority.pubkey(), &vault, &treasury, &mint.pubkey(), &args);
    let res = send(&mut svm, ix, &[&authority]);
    assert!(res.is_err(), "should fail with InvalidAmount");
}

// ─── subscribe tests ────────────────────────────────────────────────────────

#[test]
fn test_subscribe_outside_window_fails() {
    let authority = Keypair::new();
    let subscriber = Keypair::new();
    let mut svm = setup(&[&authority, &subscriber]);

    let mint = create_bare_mint(&mut svm, &authority);
    let t = now(&svm);
    let (vault, _treasury) = init_vault(&mut svm, &authority, &mint.pubkey(), t);
    let (policy, _) = policy_pda(&vault, &subscriber.pubkey());

    // subscription_start is t+10, calling now should fail
    let ix = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::Subscribe {
            vault,
            policy,
            owner: subscriber.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::Subscribe {}.data(),
    };
    let res = send(&mut svm, ix, &[&subscriber]);
    assert!(res.is_err(), "subscribe before window should fail");
}

// ─── deposit_liquidity tests ──────────────────────────────────────────────

#[test]
fn test_deposit_liquidity_success() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);

    let (mint, creator_ata) =
        create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);

    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    let deposit_amount: u64 = 50_000_000;

    let ix = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::DepositLiquidity {
            vault,
            vault_treasury: treasury,
            creator_usdc: creator_ata,
            creator: authority.pubkey(),
            usdc_mint: mint,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::DepositLiquidity { deposit_amount }.data(),
    };

    let res = send(&mut svm, ix, &[&authority]);
    assert!(res.is_ok(), "deposit_liquidity should succeed: {:?}", res.err());

    let v: insure::state::Vault = read_account(&svm, &vault);
    assert_eq!(v.total_liquidity, deposit_amount);
}

#[test]
fn test_deposit_liquidity_non_creator_fails() {
    let authority = Keypair::new();
    let attacker = Keypair::new();
    let mut svm = setup(&[&authority, &attacker]);

    let (mint, _) =
        create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let (_, attacker_ata) =
        create_usdc_mint_and_ata(&mut svm, &attacker, &attacker.pubkey(), 6, 50_000_000);

    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);

    let ix = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::DepositLiquidity {
            vault,
            vault_treasury: treasury,
            creator_usdc: attacker_ata,
            creator: attacker.pubkey(),
            usdc_mint: mint,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::DepositLiquidity { deposit_amount: 10_000_000 }.data(),
    };

    let res = send(&mut svm, ix, &[&attacker]);
    assert!(res.is_err(), "non-creator deposit should fail");
}

// ─── creator_withdraw tests ───────────────────────────────────────────────

#[test]
fn test_creator_withdraw_before_expiry_fails() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);

    let (mint, creator_ata) =
        create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);

    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);

    // deposit first
    let ix_dep = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::DepositLiquidity {
            vault,
            vault_treasury: treasury,
            creator_usdc: creator_ata,
            creator: authority.pubkey(),
            usdc_mint: mint,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::DepositLiquidity { deposit_amount: 50_000_000 }.data(),
    };
    send(&mut svm, ix_dep, &[&authority]).unwrap();

    // try withdraw before vault_expiry — must fail
    let ix_wd = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::CreatorWithdraw {
            vault,
            vault_treasury: treasury,
            creator_usdc: creator_ata,
            creator: authority.pubkey(),
            usdc_mint: mint,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::CreatorWithdraw {}.data(),
    };
    let res = send(&mut svm, ix_wd, &[&authority]);
    assert!(res.is_err(), "withdraw before vault_expiry should fail");
}

// ─── raise_claim tests ────────────────────────────────────────────────────

#[test]
fn test_raise_claim_without_subscription_fails() {
    let authority = Keypair::new();
    let claimant = Keypair::new();
    let mut svm = setup(&[&authority, &claimant]);

    let (mint, claimant_ata) =
        create_usdc_mint_and_ata(&mut svm, &authority, &claimant.pubkey(), 6, 50_000_000);

    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    let (policy, _) = policy_pda(&vault, &claimant.pubkey());
    let (claim, _) = claim_pda(&vault, &claimant.pubkey(), 0);

    // claimant has no policy — must fail
    let ix = Instruction {
        program_id: program_id(),
        accounts: insure::accounts::RaiseClaim {
            claimant: claimant.pubkey(),
            vault,
            policy,
            claim,
            claimant_usdc: claimant_ata,
            vault_treasury: treasury,
            usdc_mint: mint,
            token_program: anchor_spl::token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: insure::instruction::RaiseClaim {
            claim_data: insure::state::ClaimData::Weather {
                latitude: 12.97,
                longitude: 77.59,
            },
        }
        .data(),
    };
    let res = send(&mut svm, ix, &[&claimant]);
    assert!(res.is_err(), "raise_claim without subscription should fail");
}

fn warp_to(svm: &mut LiteSVM, ts: i64) { let mut c = svm.get_sysvar::<solana_clock::Clock>(); c.unix_timestamp = ts; svm.set_sysvar(&c); }

fn create_ata_for_mint(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Pubkey {
    let ata = Keypair::new();
    let rent = get_rent(svm);
    let mut ixs = vec![
        system_instruction::create_account(&payer.pubkey(), &ata.pubkey(), rent.minimum_balance(ATA_LEN), ATA_LEN as u64, &spl_id()),
        wrap_spl(spl_token::instruction::initialize_account(&spl_token::id(), &to_spl(&ata.pubkey()), &to_spl(mint), &to_spl(owner)).unwrap()),
    ];
    if amount > 0 {
        ixs.push(wrap_spl(spl_token::instruction::mint_to(&spl_token::id(), &to_spl(mint), &to_spl(&ata.pubkey()), &to_spl(&payer.pubkey()), &[], amount).unwrap()));
    }
    send_batch(svm, &ixs, &[payer, &ata]).unwrap();
    ata.pubkey()
}

// ─── subscribe: happy path ────────────────────────────────────────────────────
#[test]
fn test_subscribe_success() {
    let authority = Keypair::new(); let subscriber = Keypair::new();
    let mut svm = setup(&[&authority, &subscriber]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 10_000_000 }.data() }, &[&authority]).unwrap();
    warp_to(&mut svm, t + 15);
    let (policy, _) = policy_pda(&vault, &subscriber.pubkey());
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::Subscribe { vault, policy, owner: subscriber.pubkey(), system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::Subscribe {}.data() }, &[&subscriber]);
    assert!(res.is_ok(), "subscribe should succeed: {:?}", res.err());
    let p: insure::state::PolicyHolder = read_account(&svm, &policy);
    assert_eq!(p.owner, subscriber.pubkey()); assert!(p.is_subscribed); assert_eq!(p.personal_coverage_end, 0);
}

// ─── subscribe: no liquidity ──────────────────────────────────────────────────
#[test]
fn test_subscribe_insufficient_liquidity_fails() {
    let authority = Keypair::new(); let subscriber = Keypair::new();
    let mut svm = setup(&[&authority, &subscriber]);
    let mint = create_bare_mint(&mut svm, &authority);
    let t = now(&svm);
    let (vault, _) = init_vault(&mut svm, &authority, &mint.pubkey(), t);
    warp_to(&mut svm, t + 15);
    let (policy, _) = policy_pda(&vault, &subscriber.pubkey());
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::Subscribe { vault, policy, owner: subscriber.pubkey(), system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::Subscribe {}.data() }, &[&subscriber]);
    assert!(res.is_err(), "should fail InsufficientLiquidity");
}

// ─── pay_premium: happy path ──────────────────────────────────────────────────
#[test]
fn test_pay_premium_success() {
    let authority = Keypair::new(); let subscriber = Keypair::new();
    let mut svm = setup(&[&authority, &subscriber]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 50_000_000 }.data() }, &[&authority]).unwrap();
    warp_to(&mut svm, t + 15);
    let (policy, _) = policy_pda(&vault, &subscriber.pubkey());
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::Subscribe { vault, policy, owner: subscriber.pubkey(), system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::Subscribe {}.data() }, &[&subscriber]).unwrap();
    let sub_ata = create_ata_for_mint(&mut svm, &authority, &mint, &subscriber.pubkey(), 2_000_000);
    warp_to(&mut svm, t + 305);
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::PayPremium { vault, policy, owner_usdc: sub_ata, vault_treasury: treasury, creator_usdc: auth_ata, usdc_mint: mint, owner: subscriber.pubkey(), token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::PayPremium {}.data() }, &[&subscriber]);
    assert!(res.is_ok(), "pay_premium should succeed: {:?}", res.err());
    let p: insure::state::PolicyHolder = read_account(&svm, &policy);
    assert!(p.personal_coverage_end > 0); assert_eq!(p.total_premiums_paid, 1_000_000);
    let v: insure::state::Vault = read_account(&svm, &vault);
    assert_eq!(v.total_premiums_collected, 1_000_000);
}

// ─── pay_premium: not subscribed ─────────────────────────────────────────────
#[test]
fn test_pay_premium_not_subscribed_fails() {
    let authority = Keypair::new(); let stranger = Keypair::new();
    let mut svm = setup(&[&authority, &stranger]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 20_000_000 }.data() }, &[&authority]).unwrap();
    let stranger_ata = create_ata_for_mint(&mut svm, &authority, &mint, &stranger.pubkey(), 2_000_000);
    let (policy, _) = policy_pda(&vault, &stranger.pubkey());
    warp_to(&mut svm, t + 305);
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::PayPremium { vault, policy, owner_usdc: stranger_ata, vault_treasury: treasury, creator_usdc: auth_ata, usdc_mint: mint, owner: stranger.pubkey(), token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::PayPremium {}.data() }, &[&stranger]);
    assert!(res.is_err(), "pay_premium without subscribing should fail");
}

// ─── pay_premium: before coverage window ─────────────────────────────────────
#[test]
fn test_pay_premium_before_coverage_window_fails() {
    let authority = Keypair::new(); let subscriber = Keypair::new();
    let mut svm = setup(&[&authority, &subscriber]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 20_000_000 }.data() }, &[&authority]).unwrap();
    warp_to(&mut svm, t + 15);
    let (policy, _) = policy_pda(&vault, &subscriber.pubkey());
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::Subscribe { vault, policy, owner: subscriber.pubkey(), system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::Subscribe {}.data() }, &[&subscriber]).unwrap();
    let sub_ata = create_ata_for_mint(&mut svm, &authority, &mint, &subscriber.pubkey(), 2_000_000);
    // still at t+15 — before coverage_start (t+300)
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::PayPremium { vault, policy, owner_usdc: sub_ata, vault_treasury: treasury, creator_usdc: auth_ata, usdc_mint: mint, owner: subscriber.pubkey(), token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::PayPremium {}.data() }, &[&subscriber]);
    assert!(res.is_err(), "pay_premium before coverage_start should fail");
}

// ─── raise_claim: happy path ──────────────────────────────────────────────────
#[test]
fn test_raise_claim_success() {
    let authority = Keypair::new(); let claimant = Keypair::new();
    let mut svm = setup(&[&authority, &claimant]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 50_000_000 }.data() }, &[&authority]).unwrap();
    warp_to(&mut svm, t + 15);
    let (policy, _) = policy_pda(&vault, &claimant.pubkey());
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::Subscribe { vault, policy, owner: claimant.pubkey(), system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::Subscribe {}.data() }, &[&claimant]).unwrap();
    let claimant_ata = create_ata_for_mint(&mut svm, &authority, &mint, &claimant.pubkey(), 2_000_000);
    warp_to(&mut svm, t + 305);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::PayPremium { vault, policy, owner_usdc: claimant_ata, vault_treasury: treasury, creator_usdc: auth_ata, usdc_mint: mint, owner: claimant.pubkey(), token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::PayPremium {}.data() }, &[&claimant]).unwrap();
    let (claim, _) = claim_pda(&vault, &claimant.pubkey(), 0);
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::RaiseClaim { claimant: claimant.pubkey(), vault, policy, claim, claimant_usdc: claimant_ata, vault_treasury: treasury, usdc_mint: mint, token_program: anchor_spl::token::ID, system_program: system_program::ID }.to_account_metas(None), data: insure::instruction::RaiseClaim { claim_data: insure::state::ClaimData::Weather { latitude: 20.70, longitude: 77.00 } }.data() }, &[&claimant]);
    assert!(res.is_ok(), "raise_claim should succeed: {:?}", res.err());
    let c: insure::state::Claim = read_account(&svm, &claim);
    assert_eq!(c.claimant, claimant.pubkey()); assert_eq!(c.claim_number, 0);
    assert!(matches!(c.status, insure::state::ClaimStatus::Pending)); assert_eq!(c.payout_amount, 0);
    let p: insure::state::PolicyHolder = read_account(&svm, &policy);
    assert_eq!(p.claim_count, 1);
}

// ─── deposit_liquidity: after vault expiry ────────────────────────────────────
#[test]
fn test_deposit_liquidity_after_expiry_fails() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    warp_to(&mut svm, t + 7201);
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 10_000_000 }.data() }, &[&authority]);
    assert!(res.is_err(), "deposit after vault_expiry should fail");
}

// ─── creator_withdraw: happy path after expiry ────────────────────────────────
#[test]
fn test_creator_withdraw_success() {
    let authority = Keypair::new();
    let mut svm = setup(&[&authority]);
    let (mint, auth_ata) = create_usdc_mint_and_ata(&mut svm, &authority, &authority.pubkey(), 6, 100_000_000);
    let t = now(&svm);
    let (vault, treasury) = init_vault(&mut svm, &authority, &mint, t);
    send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::DepositLiquidity { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::DepositLiquidity { deposit_amount: 30_000_000 }.data() }, &[&authority]).unwrap();
    warp_to(&mut svm, t + 7201);
    let res = send(&mut svm, Instruction { program_id: program_id(), accounts: insure::accounts::CreatorWithdraw { vault, vault_treasury: treasury, creator_usdc: auth_ata, creator: authority.pubkey(), usdc_mint: mint, token_program: anchor_spl::token::ID }.to_account_metas(None), data: insure::instruction::CreatorWithdraw {}.data() }, &[&authority]);
    assert!(res.is_ok(), "creator_withdraw after expiry should succeed: {:?}", res.err());
    let v: insure::state::Vault = read_account(&svm, &vault);
    assert_eq!(v.total_liquidity, 0); assert!(v.is_paused);
}
