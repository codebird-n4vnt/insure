use anchor_lang::{
    prelude::Pubkey,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_instruction, system_program,
    },
    AnchorDeserialize, InstructionData, ToAccountMetas,
};
use insure::state::{ClaimStatus, InsuredRisk, PolicyHolder, Region, TriggerType, Vault};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use spl_token::solana_program::program_pack::Pack;

const DAY: i64 = 86_400;
const USDC: u64 = 1_000_000;
const PREMIUM: u64 = 10 * USDC;
const COVERAGE: u64 = 100 * USDC;

// ─── generic helpers ───────────────────────────────────────────────────────

fn pid() -> Pubkey {
    insure::id()
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &bh);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}", e.meta.logs))
}

fn expect_err(res: Result<(), String>, needle: &str) {
    match res {
        Ok(()) => panic!("expected failure containing `{needle}`, but tx succeeded"),
        Err(logs) => assert!(logs.contains(needle), "expected `{needle}` in logs:\n{logs}"),
    }
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<solana_clock::Clock>().unix_timestamp
}

fn warp_to(svm: &mut LiteSVM, ts: i64) {
    let mut c = svm.get_sysvar::<solana_clock::Clock>();
    c.unix_timestamp = ts;
    svm.set_sysvar(&c);
}

fn read<T: AnchorDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).expect("account not found");
    T::deserialize(&mut &acc.data[8..]).expect("deserialize failed")
}

fn token_balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    let acc = svm.get_account(key).expect("token account not found");
    spl_token::state::Account::unpack(&acc.data).unwrap().amount
}

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

fn to_spl(pk: &Pubkey) -> spl_token::solana_program::pubkey::Pubkey {
    spl_token::solana_program::pubkey::Pubkey::from(pk.to_bytes())
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let len = spl_token::state::Mint::LEN;
    let ixs = [
        system_instruction::create_account(
            &payer.pubkey(),
            &mint.pubkey(),
            svm.minimum_balance_for_rent_exemption(len),
            len as u64,
            &anchor_spl::token::ID,
        ),
        wrap_spl(
            spl_token::instruction::initialize_mint(&spl_token::id(), &to_spl(&mint.pubkey()), &to_spl(&payer.pubkey()), None, 6)
                .unwrap(),
        ),
    ];
    send(svm, &ixs, &[payer, &mint]).unwrap();
    mint.pubkey()
}

/// Plain (non-ATA) token account, funded by `mint_authority`.
fn create_token_account(svm: &mut LiteSVM, mint_authority: &Keypair, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Pubkey {
    let acc = Keypair::new();
    let len = spl_token::state::Account::LEN;
    let mut ixs = vec![
        system_instruction::create_account(
            &mint_authority.pubkey(),
            &acc.pubkey(),
            svm.minimum_balance_for_rent_exemption(len),
            len as u64,
            &anchor_spl::token::ID,
        ),
        wrap_spl(
            spl_token::instruction::initialize_account(&spl_token::id(), &to_spl(&acc.pubkey()), &to_spl(mint), &to_spl(owner))
                .unwrap(),
        ),
    ];
    if amount > 0 {
        ixs.push(wrap_spl(
            spl_token::instruction::mint_to(&spl_token::id(), &to_spl(mint), &to_spl(&acc.pubkey()), &to_spl(&mint_authority.pubkey()), &[], amount)
                .unwrap(),
        ));
    }
    send(svm, &ixs, &[mint_authority, &acc]).unwrap();
    acc.pubkey()
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), anchor_spl::token::ID.as_ref(), mint.as_ref()],
        &anchor_spl::associated_token::ID,
    )
    .0
}

// ─── PDAs ──────────────────────────────────────────────────────────────────

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &pid()).0
}
fn vault_pda(authority: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", authority.as_ref(), &id.to_le_bytes()], &pid()).0
}
fn treasury_pda(vault: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"treasury", vault.as_ref()], &pid()).0
}
fn policy_pda(vault: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"policy", vault.as_ref(), owner.as_ref()], &pid()).0
}
fn claim_pda(vault: &Pubkey, claimant: &Pubkey, n: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"claim", vault.as_ref(), claimant.as_ref(), &n.to_le_bytes()], &pid()).0
}
fn program_data_pda() -> Pubkey {
    let loader = Pubkey::from(spl_token::solana_program::bpf_loader_upgradeable::id().to_bytes());
    Pubkey::find_program_address(&[pid().as_ref()], &loader).0
}

// ─── test environment ──────────────────────────────────────────────────────

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    oracle: Keypair,
    creator: Keypair,
    mint: Pubkey,
    creator_usdc: Pubkey,
    t0: i64,
}

impl Env {
    /// Program loaded, admin is the upgrade authority, config initialised.
    fn new() -> Self {
        let mut env = Self::bare();
        let ix = env.ix_init_config(&env.admin.pubkey(), &env.oracle.pubkey(), &env.mint);
        let admin = env.admin.insecure_clone();
        send(&mut env.svm, &[ix], &[&admin]).unwrap();
        env
    }

    fn bare() -> Self {
        let admin = Keypair::new();
        let oracle = Keypair::new();
        let creator = Keypair::new();
        let mut svm = LiteSVM::new();
        svm.add_program(pid(), include_bytes!("../../../target/deploy/insure.so")).unwrap();

        // litesvm deploys with no upgrade authority; make `admin` the upgrade authority.
        let pd = program_data_pda();
        let mut acc = svm.get_account(&pd).unwrap();
        acc.data[12] = 1;
        acc.data[13..45].copy_from_slice(admin.pubkey().as_ref());
        svm.set_account(pd, acc).unwrap();

        for kp in [&admin, &oracle, &creator] {
            svm.airdrop(&kp.pubkey(), 100_000_000_000).unwrap();
        }
        let mint = create_mint(&mut svm, &admin);
        let creator_usdc = create_token_account(&mut svm, &admin, &mint, &creator.pubkey(), 10_000 * USDC);
        let t0 = now(&svm);
        Env { svm, admin, oracle, creator, mint, creator_usdc, t0 }
    }

    fn user(&mut self, usdc: u64) -> (Keypair, Pubkey) {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
        let acc = create_token_account(&mut self.svm, &self.admin, &self.mint, &kp.pubkey(), usdc);
        (kp, acc)
    }

    // ── instruction builders ──

    fn ix_init_config(&self, authority: &Pubkey, oracle: &Pubkey, mint: &Pubkey) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::InitializeConfig {
                authority: *authority,
                config: config_pda(),
                usdc_mint: *mint,
                program: pid(),
                program_data: program_data_pda(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::InitializeConfig { oracle_authority: *oracle }.data(),
        }
    }

    fn weather_args(&self, id: u64) -> insure::instruction::InitializeVault {
        insure::instruction::InitializeVault {
            vault_id: id,
            trigger_type: TriggerType::Weather,
            trigger_threshold: 50, // mm
            observation_days: 7,
            // central India
            region: Region { min_lat_e6: 18_000_000, max_lat_e6: 23_000_000, min_lon_e6: 74_000_000, max_lon_e6: 80_000_000 },
            premium_amount: PREMIUM,
            coverage_amount: COVERAGE,
            subscription_start: self.t0 + 10,
            subscription_end: self.t0 + DAY,
            coverage_start: self.t0 + DAY,
            coverage_end: self.t0 + 61 * DAY,
            vault_expiry: self.t0 + 70 * DAY,
            creator_fee_bps: 1_000,
        }
    }

    fn flight_args(&self, id: u64) -> insure::instruction::InitializeVault {
        insure::instruction::InitializeVault {
            trigger_type: TriggerType::FlightDelay,
            trigger_threshold: 120, // minutes
            observation_days: 0,
            region: Region::default(),
            ..self.weather_args(id)
        }
    }

    fn ix_init_vault(&self, args: &insure::instruction::InitializeVault, mint: &Pubkey) -> Instruction {
        let vault = vault_pda(&self.creator.pubkey(), args.vault_id);
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::InitializeVault {
                authority: self.creator.pubkey(),
                config: config_pda(),
                usdc_mint: *mint,
                vault,
                vault_treasury: treasury_pda(&vault),
                token_program: anchor_spl::token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: args.data(),
        }
    }

    fn create_vault(&mut self, args: insure::instruction::InitializeVault, liquidity: u64) -> Pubkey {
        let ix = self.ix_init_vault(&args, &self.mint);
        let creator = self.creator.insecure_clone();
        send(&mut self.svm, &[ix], &[&creator]).unwrap();
        let vault = vault_pda(&creator.pubkey(), args.vault_id);
        if liquidity > 0 {
            let ix = self.ix_deposit(&vault, liquidity);
            send(&mut self.svm, &[ix], &[&creator]).unwrap();
        }
        vault
    }

    fn ix_deposit(&self, vault: &Pubkey, amount: u64) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::DepositLiquidity {
                creator: self.creator.pubkey(),
                vault: *vault,
                vault_treasury: treasury_pda(vault),
                creator_usdc: self.creator_usdc,
                usdc_mint: self.mint,
                token_program: anchor_spl::token::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::DepositLiquidity { amount }.data(),
        }
    }

    fn treasury_accounts(&self, vault: &Pubkey, creator: &Pubkey, creator_usdc: &Pubkey) -> Vec<AccountMeta> {
        insure::accounts::CreatorTreasuryAction {
            creator: *creator,
            vault: *vault,
            vault_treasury: treasury_pda(vault),
            creator_usdc: *creator_usdc,
            usdc_mint: self.mint,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None)
    }

    fn ix_creator_withdraw(&self, vault: &Pubkey) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: self.treasury_accounts(vault, &self.creator.pubkey(), &self.creator_usdc),
            data: insure::instruction::CreatorWithdraw {}.data(),
        }
    }

    fn ix_subscribe(&self, vault: &Pubkey, owner: &Pubkey, owner_usdc: &Pubkey, risk: InsuredRisk) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::Subscribe {
                owner: *owner,
                vault: *vault,
                policy: policy_pda(vault, owner),
                owner_usdc: *owner_usdc,
                vault_treasury: treasury_pda(vault),
                usdc_mint: self.mint,
                token_program: anchor_spl::token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::Subscribe { risk }.data(),
        }
    }

    fn ix_pay_premium(&self, vault: &Pubkey, owner: &Pubkey, owner_usdc: &Pubkey) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::PayPremium {
                owner: *owner,
                vault: *vault,
                policy: policy_pda(vault, owner),
                owner_usdc: *owner_usdc,
                vault_treasury: treasury_pda(vault),
                usdc_mint: self.mint,
                token_program: anchor_spl::token::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::PayPremium {}.data(),
        }
    }

    fn ix_raise_claim(&self, vault: &Pubkey, claimant: &Pubkey, claimant_usdc: &Pubkey, n: u64) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::RaiseClaim {
                claimant: *claimant,
                vault: *vault,
                policy: policy_pda(vault, claimant),
                claim: claim_pda(vault, claimant, n),
                claimant_usdc: *claimant_usdc,
                vault_treasury: treasury_pda(vault),
                usdc_mint: self.mint,
                token_program: anchor_spl::token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::RaiseClaim {}.data(),
        }
    }

    fn ix_settle(&self, oracle: &Pubkey, vault: &Pubkey, claimant: &Pubkey, n: u64, approved: bool) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::SettleClaim {
                oracle: *oracle,
                config: config_pda(),
                vault: *vault,
                policy: policy_pda(vault, claimant),
                claim: claim_pda(vault, claimant, n),
                usdc_mint: self.mint,
                claimant: *claimant,
                claimant_usdc: ata(claimant, &self.mint),
                vault_treasury: treasury_pda(vault),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: insure::instruction::SettleClaim {
                approved,
                observed_value: 123,
                evidence_hash: [7u8; 32],
            }
            .data(),
        }
    }

    fn settle(&mut self, vault: &Pubkey, claimant: &Pubkey, n: u64, approved: bool) -> Result<(), String> {
        let ix = self.ix_settle(&self.oracle.pubkey(), vault, claimant, n, approved);
        let oracle = self.oracle.insecure_clone();
        send(&mut self.svm, &[ix], &[&oracle])
    }

    /// Weather vault with one subscribed farmer, warped to when a claim is fileable.
    fn weather_policy(&mut self) -> (Pubkey, Keypair, Pubkey) {
        let vault = self.create_vault(self.weather_args(0), 1_000 * USDC);
        let (farmer, farmer_usdc) = self.user(100 * USDC);
        warp_to(&mut self.svm, self.t0 + 100);
        let ix = self.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
        send(&mut self.svm, &[ix], &[&farmer]).unwrap();
        warp_to(&mut self.svm, self.t0 + DAY + 7 * DAY + 1);
        (vault, farmer, farmer_usdc)
    }
}

impl Env {
    fn ix_release(&self, vault: &Pubkey, owner: &Pubkey) -> Instruction {
        Instruction {
            program_id: pid(),
            accounts: insure::accounts::ReleaseLapsedPolicy { vault: *vault, policy: policy_pda(vault, owner) }
                .to_account_metas(None),
            data: insure::instruction::ReleaseLapsedPolicy {}.data(),
        }
    }
}

fn farm() -> InsuredRisk {
    InsuredRisk::Weather { latitude_e6: 20_700_000, longitude_e6: 77_000_000 }
}

fn flight(date: i64) -> InsuredRisk {
    InsuredRisk::FlightDelay { flight_number: "AI101".to_string(), flight_date: date }
}

fn day_floor(ts: i64) -> i64 {
    ts - ts.rem_euclid(DAY)
}

// ─── config ────────────────────────────────────────────────────────────────

#[test]
fn config_only_upgrade_authority_can_initialize() {
    let mut env = Env::bare();
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let ix = env.ix_init_config(&attacker.pubkey(), &attacker.pubkey(), &env.mint);
    expect_err(send(&mut env.svm, &[ix], &[&attacker]), "Unauthorised");

    let ix = env.ix_init_config(&env.admin.pubkey(), &env.oracle.pubkey(), &env.mint);
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, &[ix], &[&admin]).unwrap();
    let cfg: insure::state::Config = read(&env.svm, &config_pda());
    assert_eq!(cfg.oracle_authority, env.oracle.pubkey());
    assert_eq!(cfg.usdc_mint, env.mint);
}

#[test]
fn config_update_admin_only_and_rotates_oracle() {
    let mut env = Env::new();
    let new_oracle = Keypair::new();
    let mk = |signer: &Pubkey| Instruction {
        program_id: pid(),
        accounts: insure::accounts::UpdateConfig { admin: *signer, config: config_pda() }.to_account_metas(None),
        data: insure::instruction::UpdateConfig { new_admin: *signer, new_oracle_authority: new_oracle.pubkey() }.data(),
    };
    let creator = env.creator.insecure_clone();
    expect_err(send(&mut env.svm, &[mk(&creator.pubkey())], &[&creator]), "Unauthorised");
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, &[mk(&admin.pubkey())], &[&admin]).unwrap();

    // old oracle can no longer settle
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    expect_err(env.settle(&vault, &farmer.pubkey(), 0, true), "Unauthorised");
}

// ─── vault creation ────────────────────────────────────────────────────────

#[test]
fn vault_rejects_foreign_mint() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let fake = create_mint(&mut env.svm, &admin);
    let ix = env.ix_init_vault(&env.weather_args(0), &fake);
    let creator = env.creator.insecure_clone();
    expect_err(send(&mut env.svm, &[ix], &[&creator]), "InvalidMint");
}

#[test]
fn vault_rejects_bad_parameters() {
    let mut env = Env::new();
    let creator = env.creator.insecure_clone();
    let cases: Vec<(insure::instruction::InitializeVault, &str)> = vec![
        (insure::instruction::InitializeVault { creator_fee_bps: 10_001, ..env.weather_args(0) }, "FeeTooHigh"),
        (insure::instruction::InitializeVault { creator_fee_bps: 6_000, ..env.weather_args(0) }, "FeeTooHigh"),
        (insure::instruction::InitializeVault { premium_amount: 0, ..env.weather_args(0) }, "InvalidAmount"),
        (insure::instruction::InitializeVault { coverage_amount: PREMIUM, ..env.weather_args(0) }, "InvalidAmount"),
        (insure::instruction::InitializeVault { subscription_start: env.t0 - 5, ..env.weather_args(0) }, "InvalidTimeWindow"),
        (insure::instruction::InitializeVault { vault_expiry: env.t0 + 61 * DAY, ..env.weather_args(0) }, "InvalidTimeWindow"),
        // expiry must leave the 7-day claim filing grace after coverage ends
        (insure::instruction::InitializeVault { vault_expiry: env.t0 + 67 * DAY, ..env.weather_args(0) }, "InvalidTimeWindow"),
        (insure::instruction::InitializeVault { trigger_threshold: 0, ..env.weather_args(0) }, "InvalidThreshold"),
        (insure::instruction::InitializeVault { observation_days: 0, ..env.weather_args(0) }, "InvalidObservationWindow"),
        (insure::instruction::InitializeVault { observation_days: 7, ..env.flight_args(0) }, "InvalidObservationWindow"),
        (insure::instruction::InitializeVault { region: Region::default(), ..env.weather_args(0) }, "InvalidRegion"),
        (
            insure::instruction::InitializeVault {
                region: Region { min_lat_e6: 0, max_lat_e6: 11_000_000, min_lon_e6: 0, max_lon_e6: 1_000_000 },
                ..env.weather_args(0)
            },
            "InvalidRegion",
        ),
        (insure::instruction::InitializeVault { region: env.weather_args(0).region, ..env.flight_args(0) }, "InvalidRegion"),
    ];
    for (args, err) in cases {
        let ix = env.ix_init_vault(&args, &env.mint);
        expect_err(send(&mut env.svm, &[ix], &[&creator]), err);
    }
}

#[test]
fn deposit_by_non_creator_fails() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), 0);
    let (mallory, mallory_usdc) = env.user(100 * USDC);
    let mut ix = env.ix_deposit(&vault, 10 * USDC);
    ix.accounts[0].pubkey = mallory.pubkey();
    ix.accounts[3].pubkey = mallory_usdc;
    expect_err(send(&mut env.svm, &[ix], &[&mallory]), "Unauthorised");
}

// ─── subscribe ─────────────────────────────────────────────────────────────

#[test]
fn subscribe_charges_first_premium_and_accrues_fee() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();

    assert_eq!(token_balance(&env.svm, &farmer_usdc), 90 * USDC);
    assert_eq!(token_balance(&env.svm, &treasury_pda(&vault)), 1_010 * USDC);
    let v: Vault = read(&env.svm, &vault);
    assert_eq!(v.active_policies, 1);
    assert_eq!(v.creator_fees_accrued, USDC); // 10%
    let p: PolicyHolder = read(&env.svm, &policy_pda(&vault, &farmer.pubkey()));
    assert_eq!(p.risk, farm());
    assert_eq!(p.personal_coverage_end, v.coverage_start + 30 * DAY);
}

#[test]
fn subscribe_outside_window_fails() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    expect_err(send(&mut env.svm, &[ix.clone()], &[&farmer]), "SubscriptionClosed");
    warp_to(&mut env.svm, env.t0 + DAY + 1);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "SubscriptionClosed");
}

#[test]
fn subscribe_rejects_invalid_risks() {
    let mut env = Env::new();
    let weather = env.create_vault(env.weather_args(0), 1_000 * USDC);
    let flights = env.create_vault(env.flight_args(1), 1_000 * USDC);
    let (user, user_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let fdate = day_floor(env.t0 + 10 * DAY);

    let cases = vec![
        (weather, flight(fdate), "RiskTypeMismatch"),
        (flights, farm(), "RiskTypeMismatch"),
        (weather, InsuredRisk::Weather { latitude_e6: 91_000_000, longitude_e6: 0 }, "InvalidCoordinates"),
        // Thar desert: valid coordinates, but outside the vault's region
        (weather, InsuredRisk::Weather { latitude_e6: 27_000_000, longitude_e6: 71_000_000 }, "OutsideRegion"),
        (flights, InsuredRisk::FlightDelay { flight_number: "ai101".into(), flight_date: fdate }, "InvalidFlightNumber"),
        (flights, InsuredRisk::FlightDelay { flight_number: "A1".into(), flight_date: fdate }, "InvalidFlightNumber"),
        (flights, flight(fdate + 3600), "InvalidFlightDate"),
        (flights, flight(day_floor(env.t0 + 200 * DAY)), "InvalidFlightDate"),
    ];
    for (vault, risk, err) in cases {
        let ix = env.ix_subscribe(&vault, &user.pubkey(), &user_usdc, risk);
        expect_err(send(&mut env.svm, &[ix], &[&user]), err);
    }
}

#[test]
fn subscribe_respects_capacity() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), COVERAGE); // room for exactly one policy
    let (a, a_usdc) = env.user(100 * USDC);
    let (b, b_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &a.pubkey(), &a_usdc, farm());
    send(&mut env.svm, &[ix], &[&a]).unwrap();
    let ix = env.ix_subscribe(&vault, &b.pubkey(), &b_usdc, farm());
    expect_err(send(&mut env.svm, &[ix], &[&b]), "InsufficientLiquidity");
}

#[test]
fn pause_blocks_new_subscriptions_only() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let pause = Instruction {
        program_id: pid(),
        accounts: insure::accounts::SetVaultPaused { creator: env.creator.pubkey(), vault }.to_account_metas(None),
        data: insure::instruction::SetVaultPaused { paused: true }.data(),
    };
    let creator = env.creator.insecure_clone();
    send(&mut env.svm, &[pause], &[&creator]).unwrap();

    // existing policyholder still gets paid while paused
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    env.settle(&vault, &farmer.pubkey(), 0, true).unwrap();
}

// ─── premiums ──────────────────────────────────────────────────────────────

#[test]
fn renewal_extends_and_lapse_blocks() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();

    let policy = policy_pda(&vault, &farmer.pubkey());
    let end0 = read::<PolicyHolder>(&env.svm, &policy).personal_coverage_end;
    warp_to(&mut env.svm, end0 - DAY);
    let ix = env.ix_pay_premium(&vault, &farmer.pubkey(), &farmer_usdc);
    send(&mut env.svm, &[ix.clone()], &[&farmer]).unwrap();
    let p: PolicyHolder = read(&env.svm, &policy);
    assert_eq!(p.personal_coverage_end, end0 + 30 * DAY);
    assert_eq!(p.total_premiums_paid, 2 * PREMIUM);

    // capped at coverage_end → a third payment would buy nothing
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "AlreadyFullyCovered");
}

#[test]
fn renewal_after_grace_fails() {
    let mut env = Env::new();
    let args = insure::instruction::InitializeVault { coverage_end: env.t0 + 91 * DAY, vault_expiry: env.t0 + 100 * DAY, ..env.weather_args(0) };
    let vault = env.create_vault(args, 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let end0 = read::<PolicyHolder>(&env.svm, &policy_pda(&vault, &farmer.pubkey())).personal_coverage_end;
    warp_to(&mut env.svm, end0 + 11 * DAY);
    let ix = env.ix_pay_premium(&vault, &farmer.pubkey(), &farmer_usdc);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "CoverageLapsed");
}

#[test]
fn flight_policy_is_single_premium() {
    let mut env = Env::new();
    let vault = env.create_vault(env.flight_args(0), 1_000 * USDC);
    let (traveller, t_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &traveller.pubkey(), &t_usdc, flight(day_floor(env.t0 + 10 * DAY)));
    send(&mut env.svm, &[ix], &[&traveller]).unwrap();
    let v: Vault = read(&env.svm, &vault);
    let p: PolicyHolder = read(&env.svm, &policy_pda(&vault, &traveller.pubkey()));
    assert_eq!(p.personal_coverage_end, v.coverage_end);
    warp_to(&mut env.svm, env.t0 + 2 * DAY);
    let ix = env.ix_pay_premium(&vault, &traveller.pubkey(), &t_usdc);
    expect_err(send(&mut env.svm, &[ix], &[&traveller]), "AlreadyFullyCovered");
}

// ─── claims ────────────────────────────────────────────────────────────────

#[test]
fn weather_claim_before_observation_window_fails() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    warp_to(&mut env.svm, env.t0 + DAY + 3 * DAY);
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "ClaimTooEarly");
}

#[test]
fn weather_claim_filing_grace_after_coverage_ends() {
    let mut env = Env::new();
    let args = insure::instruction::InitializeVault { observation_days: 30, ..env.weather_args(0) };
    let vault = env.create_vault(args, 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let end = read::<PolicyHolder>(&env.svm, &policy_pda(&vault, &farmer.pubkey())).personal_coverage_end;

    // 30-day window == one paid month: fileable after coverage ends, within the grace period
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    warp_to(&mut env.svm, end + 8 * DAY);
    expect_err(send(&mut env.svm, &[ix.clone()], &[&farmer]), "OutsideCoverageWindow");
    warp_to(&mut env.svm, end + 3 * DAY);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
}

#[test]
fn weather_claim_needs_paid_window() {
    let mut env = Env::new();
    let args = insure::instruction::InitializeVault { observation_days: 45, ..env.weather_args(0) };
    let vault = env.create_vault(args, 1_000 * USDC);
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    // only one month paid, but the window is 45 days
    warp_to(&mut env.svm, env.t0 + DAY + 45 * DAY);
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "ObservationWindowNotCovered");
}

#[test]
fn flight_claim_before_flight_fails_after_succeeds() {
    let mut env = Env::new();
    let vault = env.create_vault(env.flight_args(0), 1_000 * USDC);
    let (traveller, t_usdc) = env.user(100 * USDC);
    let fdate = day_floor(env.t0 + 10 * DAY);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &traveller.pubkey(), &t_usdc, flight(fdate));
    send(&mut env.svm, &[ix], &[&traveller]).unwrap();

    warp_to(&mut env.svm, fdate - 1);
    let ix = env.ix_raise_claim(&vault, &traveller.pubkey(), &t_usdc, 0);
    expect_err(send(&mut env.svm, &[ix.clone()], &[&traveller]), "ClaimTooEarly");
    warp_to(&mut env.svm, fdate + DAY);
    send(&mut env.svm, &[ix], &[&traveller]).unwrap();
    let c: insure::state::Claim = read(&env.svm, &claim_pda(&vault, &traveller.pubkey(), 0));
    assert_eq!(c.risk, flight(fdate));
}

#[test]
fn only_one_pending_claim_per_policy() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 1);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "ClaimAlreadyPending");
}

#[test]
fn claim_by_non_policyholder_fails() {
    let mut env = Env::new();
    let (vault, _farmer, _) = env.weather_policy();
    let (mallory, m_usdc) = env.user(100 * USDC);
    let ix = env.ix_raise_claim(&vault, &mallory.pubkey(), &m_usdc, 0);
    assert!(send(&mut env.svm, &[ix], &[&mallory]).is_err());
}

// ─── settlement (the critical path) ───────────────────────────────────────

/// Regression: the old settle_claim trusted any caller-supplied Switchboard feed,
/// so anyone could settle any claim as approved and drain the vault.
#[test]
fn settle_by_non_oracle_fails() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();

    for attacker in [farmer.insecure_clone(), env.creator.insecure_clone()] {
        let ix = env.ix_settle(&attacker.pubkey(), &vault, &farmer.pubkey(), 0, true);
        expect_err(send(&mut env.svm, &[ix], &[&attacker]), "Unauthorised");
    }
}

#[test]
fn approved_claim_pays_out_once() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();

    // The claimant never had an ATA — settlement creates it rather than failing.
    assert!(env.svm.get_account(&ata(&farmer.pubkey(), &env.mint)).is_none());
    env.settle(&vault, &farmer.pubkey(), 0, true).unwrap();
    assert_eq!(token_balance(&env.svm, &ata(&farmer.pubkey(), &env.mint)), COVERAGE);

    let c: insure::state::Claim = read(&env.svm, &claim_pda(&vault, &farmer.pubkey(), 0));
    assert_eq!(c.status, ClaimStatus::Approved);
    assert_eq!(c.observed_value, 123);
    assert_eq!(c.evidence_hash, [7u8; 32]);
    let v: Vault = read(&env.svm, &vault);
    assert_eq!(v.total_liquidity, 900 * USDC);
    assert_eq!(v.active_policies, 0);
    assert_eq!(v.pending_claims, 0);

    // settling the same claim again fails
    expect_err(env.settle(&vault, &farmer.pubkey(), 0, true), "ClaimAlreadySettled");
    // and a second claim on a paid-out policy is refused
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 1);
    expect_err(send(&mut env.svm, &[ix], &[&farmer]), "PolicyAlreadyPaidOut");
}

#[test]
fn rejected_claim_allows_a_new_claim() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    env.settle(&vault, &farmer.pubkey(), 0, false).unwrap();
    let c: insure::state::Claim = read(&env.svm, &claim_pda(&vault, &farmer.pubkey(), 0));
    assert_eq!(c.status, ClaimStatus::Rejected);
    assert_eq!(c.payout_amount, 0);

    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 1);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
}

// ─── creator funds ─────────────────────────────────────────────────────────

#[test]
fn excess_withdrawal_keeps_policies_collateralised() {
    let mut env = Env::new();
    let (vault, _, _) = env.weather_policy(); // 1000 liquidity, 100 committed
    let creator = env.creator.insecure_clone();
    let mk = |env: &Env, amount| Instruction {
        program_id: pid(),
        accounts: env.treasury_accounts(&vault, &env.creator.pubkey(), &env.creator_usdc),
        data: insure::instruction::WithdrawExcessLiquidity { amount }.data(),
    };
    let ix = mk(&env, 901 * USDC);
    expect_err(send(&mut env.svm, &[ix], &[&creator]), "InsufficientLiquidity");
    let ix = mk(&env, 900 * USDC);
    send(&mut env.svm, &[ix], &[&creator]).unwrap();
    assert_eq!(read::<Vault>(&env.svm, &vault).total_liquidity, COVERAGE);
}

#[test]
fn creator_fees_are_claimable() {
    let mut env = Env::new();
    let (vault, _, _) = env.weather_policy();
    let before = token_balance(&env.svm, &env.creator_usdc);
    let ix = Instruction {
        program_id: pid(),
        accounts: env.treasury_accounts(&vault, &env.creator.pubkey(), &env.creator_usdc),
        data: insure::instruction::ClaimCreatorFees {}.data(),
    };
    let creator = env.creator.insecure_clone();
    send(&mut env.svm, &[ix], &[&creator]).unwrap();
    assert_eq!(token_balance(&env.svm, &env.creator_usdc) - before, USDC);
    assert_eq!(read::<Vault>(&env.svm, &vault).creator_fees_accrued, 0);
}

#[test]
fn creator_withdraw_rules() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let creator = env.creator.insecure_clone();
    let expiry = read::<Vault>(&env.svm, &vault).vault_expiry;

    let ix = env.ix_creator_withdraw(&vault);

    expect_err(send(&mut env.svm, &[ix], &[&creator]), "VaultNotExpired");

    // a non-creator can't withdraw even after expiry
    let (mallory, m_usdc) = env.user(0);
    warp_to(&mut env.svm, expiry);
    let ix = Instruction {
        program_id: pid(),
        accounts: env.treasury_accounts(&vault, &mallory.pubkey(), &m_usdc),
        data: insure::instruction::CreatorWithdraw {}.data(),
    };
    expect_err(send(&mut env.svm, &[ix], &[&mallory]), "Unauthorised");

    // pending claim blocks withdrawal...
    warp_to(&mut env.svm, env.t0 + 20 * DAY);
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    warp_to(&mut env.svm, expiry);
    let ix = env.ix_creator_withdraw(&vault);
    expect_err(send(&mut env.svm, &[ix], &[&creator]), "ClaimsPending");

    // ...until the oracle has been silent for 7 days past expiry
    warp_to(&mut env.svm, expiry + 7 * DAY);
    let before = token_balance(&env.svm, &env.creator_usdc);
    let ix = env.ix_creator_withdraw(&vault);
    send(&mut env.svm, &[ix], &[&creator]).unwrap();
    assert_eq!(token_balance(&env.svm, &env.creator_usdc) - before, 1_010 * USDC + 5_000);
    let v: Vault = read(&env.svm, &vault);
    assert!(v.is_closed);

    // closed vault can't be withdrawn twice or pay out
    let ix = env.ix_creator_withdraw(&vault);
    expect_err(send(&mut env.svm, &[ix], &[&creator]), "VaultClosed");
    expect_err(env.settle(&vault, &farmer.pubkey(), 0, true), "VaultClosed");
}

#[test]
fn creator_withdraw_after_expiry_with_no_pending_claims() {
    let mut env = Env::new();
    let vault = env.create_vault(env.weather_args(0), 500 * USDC);
    let expiry = read::<Vault>(&env.svm, &vault).vault_expiry;
    warp_to(&mut env.svm, expiry);
    let creator = env.creator.insecure_clone();
    let ix = env.ix_creator_withdraw(&vault);
    send(&mut env.svm, &[ix], &[&creator]).unwrap();
    assert_eq!(token_balance(&env.svm, &treasury_pda(&vault)), 0);
}

/// Off-chain code filters getProgramAccounts by exact account size (Anchor's TS
/// client can't compute sizes for Strings inside enums). If this fails, update
/// ACCOUNT_SIZE in backend/src/raw.ts and frontend/src/lib/anchor.ts.
#[test]
fn account_sizes_match_offchain_filters() {
    use anchor_lang::Space;
    assert_eq!(8 + insure::state::Vault::INIT_SPACE, 233);
    assert_eq!(8 + insure::state::PolicyHolder::INIT_SPACE, 129);
    assert_eq!(8 + insure::state::Claim::INIT_SPACE, 199);
    assert_eq!(8 + insure::state::Config::INIT_SPACE, 105);
}

// ─── lapsed policies, config guards, layout ────────────────────────────────

#[test]
fn lapsed_weather_policy_releases_capacity_only_after_every_window() {
    let mut env = Env::new();
    let args = insure::instruction::InitializeVault { coverage_end: env.t0 + 91 * DAY, vault_expiry: env.t0 + 100 * DAY, ..env.weather_args(0) };
    let vault = env.create_vault(args, COVERAGE); // capacity for exactly one policy
    let (farmer, farmer_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&vault, &farmer.pubkey(), &farmer_usdc, farm());
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let end = read::<PolicyHolder>(&env.svm, &policy_pda(&vault, &farmer.pubkey())).personal_coverage_end;
    let cranker = env.creator.insecure_clone(); // permissionless: anyone may crank it

    // still renewable (10-day grace) → can't be released
    warp_to(&mut env.svm, end + 9 * DAY);
    let ix = env.ix_release(&vault, &farmer.pubkey());
    expect_err(send(&mut env.svm, &[ix.clone()], &[&cranker]), "PolicyStillActive");

    // every renewal and claim window has closed → released
    warp_to(&mut env.svm, end + 10 * DAY + 1);
    send(&mut env.svm, &[ix.clone()], &[&cranker]).unwrap();
    let v: Vault = read(&env.svm, &vault);
    assert_eq!(v.active_policies, 0);
    assert!(read::<PolicyHolder>(&env.svm, &policy_pda(&vault, &farmer.pubkey())).released);

    // can't release twice, and the policy can't claim or renew any more
    expect_err(send(&mut env.svm, &[ix], &[&cranker]), "PolicyStillActive");
    let claim = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    expect_err(send(&mut env.svm, &[claim], &[&farmer]), "CoverageLapsed");
    let renew = env.ix_pay_premium(&vault, &farmer.pubkey(), &farmer_usdc);
    expect_err(send(&mut env.svm, &[renew], &[&farmer]), "CoverageLapsed");

    // the freed payout is now withdrawable by the underwriter
    let creator = env.creator.insecure_clone();
    let w = Instruction {
        program_id: pid(),
        accounts: env.treasury_accounts(&vault, &env.creator.pubkey(), &env.creator_usdc),
        data: insure::instruction::WithdrawExcessLiquidity { amount: COVERAGE }.data(),
    };
    send(&mut env.svm, &[w], &[&creator]).unwrap();
}

#[test]
fn release_refuses_pending_paid_or_flight_policies() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let end = read::<PolicyHolder>(&env.svm, &policy_pda(&vault, &farmer.pubkey())).personal_coverage_end;
    warp_to(&mut env.svm, end + 30 * DAY);
    let creator = env.creator.insecure_clone();
    let rel = env.ix_release(&vault, &farmer.pubkey());
    expect_err(send(&mut env.svm, &[rel.clone()], &[&creator]), "PolicyStillActive"); // claim pending
    env.settle(&vault, &farmer.pubkey(), 0, true).unwrap();
    expect_err(send(&mut env.svm, &[rel], &[&creator]), "PolicyStillActive"); // already paid out

    let mut env = Env::new();
    let fvault = env.create_vault(env.flight_args(0), 1_000 * USDC);
    let (traveller, t_usdc) = env.user(100 * USDC);
    warp_to(&mut env.svm, env.t0 + 100);
    let ix = env.ix_subscribe(&fvault, &traveller.pubkey(), &t_usdc, flight(day_floor(env.t0 + 10 * DAY)));
    send(&mut env.svm, &[ix], &[&traveller]).unwrap();
    warp_to(&mut env.svm, env.t0 + 69 * DAY);
    let creator = env.creator.insecure_clone();
    let rel = env.ix_release(&fvault, &traveller.pubkey());
    expect_err(send(&mut env.svm, &[rel], &[&creator]), "PolicyStillActive");
}

#[test]
fn config_rejects_default_keys() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let ix = Instruction {
        program_id: pid(),
        accounts: insure::accounts::UpdateConfig { admin: admin.pubkey(), config: config_pda() }.to_account_metas(None),
        data: insure::instruction::UpdateConfig { new_admin: admin.pubkey(), new_oracle_authority: Pubkey::default() }.data(),
    };
    expect_err(send(&mut env.svm, &[ix], &[&admin]), "InvalidAuthority");
}

#[test]
fn claim_status_sits_at_the_documented_offset() {
    let mut env = Env::new();
    let (vault, farmer, farmer_usdc) = env.weather_policy();
    let ix = env.ix_raise_claim(&vault, &farmer.pubkey(), &farmer_usdc, 0);
    send(&mut env.svm, &[ix], &[&farmer]).unwrap();
    let key = claim_pda(&vault, &farmer.pubkey(), 0);
    let off = insure::CLAIM_STATUS_OFFSET as usize;
    assert_eq!(env.svm.get_account(&key).unwrap().data[off], 0, "Pending == 0");
    env.settle(&vault, &farmer.pubkey(), 0, true).unwrap();
    assert_eq!(env.svm.get_account(&key).unwrap().data[off], 1, "Approved == 1");
}
