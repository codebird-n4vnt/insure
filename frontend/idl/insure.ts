/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/insure.json`.
 */
export type Insure = {
  "address": "5v7WLSTuZPwfjKWaEvPNfic6sghmnaoup1oxFfbNe4wF",
  "metadata": {
    "name": "insure",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claimCreatorFees",
      "discriminator": [
        0,
        23,
        125,
        234,
        156,
        118,
        134,
        89
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "creatorWithdraw",
      "docs": [
        "After expiry the creator takes back everything left in the treasury.",
        "Blocked while claims are pending, unless the oracle has been silent for",
        "FORCE_WITHDRAW_DELAY past expiry."
      ],
      "discriminator": [
        92,
        117,
        206,
        254,
        174,
        108,
        37,
        106
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "depositLiquidity",
      "discriminator": [
        245,
        99,
        59,
        25,
        151,
        71,
        233,
        249
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "One-time protocol setup. Only the program's upgrade authority can call this,",
        "so nobody can front-run deployment and install their own oracle."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "program",
          "address": "5v7WLSTuZPwfjKWaEvPNfic6sghmnaoup1oxFfbNe4wF"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oracleAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "vaultId"
              }
            ]
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vaultId",
          "type": "u64"
        },
        {
          "name": "triggerType",
          "type": {
            "defined": {
              "name": "triggerType"
            }
          }
        },
        {
          "name": "triggerThreshold",
          "type": "i64"
        },
        {
          "name": "observationDays",
          "type": "u16"
        },
        {
          "name": "region",
          "type": {
            "defined": {
              "name": "region"
            }
          }
        },
        {
          "name": "premiumAmount",
          "type": "u64"
        },
        {
          "name": "coverageAmount",
          "type": "u64"
        },
        {
          "name": "subscriptionStart",
          "type": "i64"
        },
        {
          "name": "subscriptionEnd",
          "type": "i64"
        },
        {
          "name": "coverageStart",
          "type": "i64"
        },
        {
          "name": "coverageEnd",
          "type": "i64"
        },
        {
          "name": "vaultExpiry",
          "type": "i64"
        },
        {
          "name": "creatorFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "payPremium",
      "docs": [
        "Renew a weather policy for another month."
      ],
      "discriminator": [
        156,
        253,
        113,
        97,
        167,
        54,
        253,
        245
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "raiseClaim",
      "docs": [
        "File a claim against the policy's own insured risk. The oracle picks it up",
        "from the `ClaimFiled` event (or by polling) and settles it."
      ],
      "discriminator": [
        82,
        27,
        166,
        20,
        46,
        132,
        162,
        69
      ],
      "accounts": [
        {
          "name": "claimant",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "claimant"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "claimant"
              },
              {
                "kind": "account",
                "path": "policy.claimCount",
                "account": "policyHolder"
              }
            ]
          }
        },
        {
          "name": "claimantUsdc",
          "writable": true
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "releaseLapsedPolicy",
      "docs": [
        "Frees the capital backing a weather policy that can no longer be renewed or",
        "claimed on (its owner stopped paying). Permissionless: the conditions alone",
        "guarantee no legitimate claim is cut off, and underwriters get their",
        "capacity back without waiting for the vault to expire."
      ],
      "discriminator": [
        97,
        69,
        0,
        47,
        236,
        139,
        98,
        185
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policyHolder"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "setVaultPaused",
      "docs": [
        "Pausing only stops new subscriptions. Existing policyholders can always",
        "renew and get their claims settled, so a creator can't pause their way out of a payout."
      ],
      "discriminator": [
        239,
        131,
        203,
        69,
        243,
        11,
        234,
        153
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleClaim",
      "docs": [
        "Only the configured oracle can settle. The verdict, the measured value and a",
        "hash of the evidence are recorded on-chain so anyone can audit the decision."
      ],
      "discriminator": [
        205,
        203,
        21,
        66,
        255,
        231,
        209,
        155
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "policy",
            "claim"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "claim.claimant",
                "account": "claim"
              }
            ]
          },
          "relations": [
            "claim"
          ]
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "claim.claimant",
                "account": "claim"
              },
              {
                "kind": "account",
                "path": "claim.claimNumber",
                "account": "claim"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "claimant"
        },
        {
          "name": "claimantUsdc",
          "docs": [
            "Created if the claimant closed their USDC account, so a payout can't be blocked."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "claimant"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "approved",
          "type": "bool"
        },
        {
          "name": "observedValue",
          "type": "i64"
        },
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "subscribe",
      "docs": [
        "Buy a policy: registers the insured risk and pays the first premium atomically,",
        "so capacity can't be squatted by free subscriptions."
      ],
      "discriminator": [
        254,
        28,
        191,
        138,
        156,
        179,
        183,
        53
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "risk",
          "type": {
            "defined": {
              "name": "insuredRisk"
            }
          }
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Rotate the oracle key and/or hand over admin rights."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        },
        {
          "name": "newOracleAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdrawExcessLiquidity",
      "docs": [
        "Withdraw capital that isn't backing any policy. Exposure stays fully collateralised."
      ],
      "discriminator": [
        51,
        186,
        10,
        85,
        52,
        210,
        117,
        192
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "vaultTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "claim",
      "discriminator": [
        155,
        70,
        22,
        176,
        123,
        215,
        246,
        102
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "policyHolder",
      "discriminator": [
        100,
        23,
        218,
        127,
        87,
        62,
        52,
        135
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "claimFiled",
      "discriminator": [
        78,
        228,
        214,
        247,
        197,
        67,
        130,
        19
      ]
    },
    {
      "name": "claimSettled",
      "discriminator": [
        144,
        220,
        131,
        115,
        8,
        187,
        224,
        236
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "liquidityDeposited",
      "discriminator": [
        218,
        155,
        74,
        193,
        59,
        66,
        94,
        122
      ]
    },
    {
      "name": "liquidityWithdrawn",
      "discriminator": [
        240,
        120,
        73,
        139,
        154,
        31,
        218,
        68
      ]
    },
    {
      "name": "policyPurchased",
      "discriminator": [
        120,
        100,
        255,
        218,
        16,
        36,
        194,
        192
      ]
    },
    {
      "name": "policyReleased",
      "discriminator": [
        96,
        219,
        171,
        174,
        33,
        159,
        243,
        160
      ]
    },
    {
      "name": "premiumPaid",
      "discriminator": [
        159,
        75,
        105,
        27,
        181,
        14,
        243,
        40
      ]
    },
    {
      "name": "vaultClosed",
      "discriminator": [
        238,
        129,
        38,
        228,
        227,
        118,
        249,
        215
      ]
    },
    {
      "name": "vaultCreated",
      "discriminator": [
        117,
        25,
        120,
        254,
        75,
        236,
        78,
        115
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTimeWindow",
      "msg": "The time you entered is invalid"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "vaultPaused",
      "msg": "Vault is paused for new subscriptions"
    },
    {
      "code": 6003,
      "name": "vaultClosed",
      "msg": "Vault is closed"
    },
    {
      "code": 6004,
      "name": "subscriptionClosed",
      "msg": "Subscription is closed right now"
    },
    {
      "code": 6005,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in the vault to underwrite another policy"
    },
    {
      "code": 6006,
      "name": "unauthorised",
      "msg": "Unauthorised access"
    },
    {
      "code": 6007,
      "name": "invalidMint",
      "msg": "Token mint does not match the vault's mint"
    },
    {
      "code": 6008,
      "name": "outsideCoverageWindow",
      "msg": "You are outside the coverage window"
    },
    {
      "code": 6009,
      "name": "coverageLapsed",
      "msg": "Your insurance coverage has lapsed"
    },
    {
      "code": 6010,
      "name": "alreadyFullyCovered",
      "msg": "Coverage is already paid up to the end of the vault"
    },
    {
      "code": 6011,
      "name": "claimAlreadySettled",
      "msg": "This claim has already been settled"
    },
    {
      "code": 6012,
      "name": "claimAlreadyPending",
      "msg": "This policy already has a claim awaiting settlement"
    },
    {
      "code": 6013,
      "name": "policyAlreadyPaidOut",
      "msg": "This policy has already received its payout"
    },
    {
      "code": 6014,
      "name": "vaultExpired",
      "msg": "Vault is expired"
    },
    {
      "code": 6015,
      "name": "vaultNotExpired",
      "msg": "Vault money can only be withdrawn after the vault has expired"
    },
    {
      "code": 6016,
      "name": "claimsPending",
      "msg": "Claims are still pending settlement"
    },
    {
      "code": 6017,
      "name": "feeTooHigh",
      "msg": "Creator fee exceeds the allowed maximum"
    },
    {
      "code": 6018,
      "name": "invalidThreshold",
      "msg": "Trigger threshold is invalid for this trigger type"
    },
    {
      "code": 6019,
      "name": "invalidObservationWindow",
      "msg": "Observation window is invalid"
    },
    {
      "code": 6020,
      "name": "riskTypeMismatch",
      "msg": "Insured risk does not match the vault's trigger type"
    },
    {
      "code": 6021,
      "name": "invalidCoordinates",
      "msg": "Latitude or longitude out of range"
    },
    {
      "code": 6022,
      "name": "invalidRegion",
      "msg": "Coverage region is invalid (must be a box at most 10° wide)"
    },
    {
      "code": 6023,
      "name": "outsideRegion",
      "msg": "This location is outside the vault's coverage region"
    },
    {
      "code": 6024,
      "name": "invalidFlightNumber",
      "msg": "Flight number must be 3-8 uppercase letters or digits"
    },
    {
      "code": 6025,
      "name": "invalidFlightDate",
      "msg": "Flight date must be a UTC midnight inside the coverage window"
    },
    {
      "code": 6026,
      "name": "observationWindowNotCovered",
      "msg": "Paid coverage doesn't span a full observation window; renew first"
    },
    {
      "code": 6027,
      "name": "claimTooEarly",
      "msg": "It is too early to file this claim"
    },
    {
      "code": 6028,
      "name": "policyStillActive",
      "msg": "This policy can still be renewed or claimed on"
    },
    {
      "code": 6029,
      "name": "invalidAuthority",
      "msg": "Address cannot be the default (all-zero) key"
    },
    {
      "code": 6030,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "claim",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "claimant",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "claimNumber",
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Kept before the variable-length `risk` so it sits at a fixed offset",
              "(CLAIM_STATUS_OFFSET) and indexers can filter pending claims with memcmp."
            ],
            "type": {
              "defined": {
                "name": "claimStatus"
              }
            }
          },
          {
            "name": "risk",
            "docs": [
              "Snapshot of the policy's insured risk at filing time."
            ],
            "type": {
              "defined": {
                "name": "insuredRisk"
              }
            }
          },
          {
            "name": "filedAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "payoutAmount",
            "type": "u64"
          },
          {
            "name": "observedValue",
            "docs": [
              "Measured value the oracle decided on: rainfall in 0.1 mm, or delay in minutes",
              "(-1 = cancelled). 0 while pending."
            ],
            "type": "i64"
          },
          {
            "name": "evidenceHash",
            "docs": [
              "sha256 of the oracle's evidence bundle (raw API data + reasoning), served by the keeper."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "claimFiled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claim",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "claimant",
            "type": "pubkey"
          },
          {
            "name": "claimNumber",
            "type": "u64"
          },
          {
            "name": "filedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "claimSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claim",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "claimant",
            "type": "pubkey"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "payoutAmount",
            "type": "u64"
          },
          {
            "name": "observedValue",
            "type": "i64"
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "claimStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "approved"
          },
          {
            "name": "rejected"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Protocol-wide settings. Created once by the program's upgrade authority."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracleAuthority",
            "docs": [
              "The only key allowed to settle claims."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "The only mint vaults may be denominated in (USDC)."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracleAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "insuredRisk",
      "docs": [
        "The thing a policy insures. Fixed at subscription time so a claimant",
        "can't pick whichever location or flight happened to have a bad day."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "weather",
            "fields": [
              {
                "name": "latitudeE6",
                "docs": [
                  "Degrees × 1e6"
                ],
                "type": "i32"
              },
              {
                "name": "longitudeE6",
                "docs": [
                  "Degrees × 1e6"
                ],
                "type": "i32"
              }
            ]
          },
          {
            "name": "flightDelay",
            "fields": [
              {
                "name": "flightNumber",
                "docs": [
                  "IATA flight number, e.g. \"AI101\""
                ],
                "type": "string"
              },
              {
                "name": "flightDate",
                "docs": [
                  "UTC midnight of the scheduled departure date"
                ],
                "type": "i64"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "liquidityDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalLiquidity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalLiquidity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "policyHolder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "risk",
            "type": {
              "defined": {
                "name": "insuredRisk"
              }
            }
          },
          {
            "name": "coveredFrom",
            "docs": [
              "When coverage began (first premium or coverage_start, whichever is later)."
            ],
            "type": "i64"
          },
          {
            "name": "personalCoverageEnd",
            "type": "i64"
          },
          {
            "name": "totalPremiumsPaid",
            "type": "u64"
          },
          {
            "name": "claimCount",
            "type": "u64"
          },
          {
            "name": "hasPendingClaim",
            "type": "bool"
          },
          {
            "name": "paidOut",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "released",
            "docs": [
              "Set by `release_lapsed_policy` once every renewal and claim window has",
              "closed; its payout no longer counts against the vault's capacity."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "policyPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "personalCoverageEnd",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "policyReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "activePolicies",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "premiumPaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policyHolder",
            "type": "pubkey"
          },
          {
            "name": "amountPaid",
            "type": "u64"
          },
          {
            "name": "personalCoverageEnd",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "region",
      "docs": [
        "Weather vaults only insure farms inside this box, so a policy priced for one",
        "climate can't be bought for a much drier one. Micro-degrees; all zero for flight vaults."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minLatE6",
            "type": "i32"
          },
          {
            "name": "maxLatE6",
            "type": "i32"
          },
          {
            "name": "minLonE6",
            "type": "i32"
          },
          {
            "name": "maxLonE6",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "triggerType",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "weather"
          },
          {
            "name": "flightDelay"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "vaultId",
            "type": "u64"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "triggerType",
            "type": {
              "defined": {
                "name": "triggerType"
              }
            }
          },
          {
            "name": "triggerThreshold",
            "type": "i64"
          },
          {
            "name": "observationDays",
            "docs": [
              "Weather only: length of the trailing rainfall window, in days."
            ],
            "type": "u16"
          },
          {
            "name": "region",
            "docs": [
              "Weather only: where insured farms may be."
            ],
            "type": {
              "defined": {
                "name": "region"
              }
            }
          },
          {
            "name": "premiumAmount",
            "type": "u64"
          },
          {
            "name": "coverageAmount",
            "type": "u64"
          },
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "subscriptionStart",
            "type": "i64"
          },
          {
            "name": "subscriptionEnd",
            "type": "i64"
          },
          {
            "name": "coverageStart",
            "type": "i64"
          },
          {
            "name": "coverageEnd",
            "type": "i64"
          },
          {
            "name": "vaultExpiry",
            "type": "i64"
          },
          {
            "name": "totalLiquidity",
            "docs": [
              "Creator capital backing the policies (deposits − payouts − excess withdrawals)."
            ],
            "type": "u64"
          },
          {
            "name": "creatorFeesAccrued",
            "docs": [
              "Creator fees sitting in the treasury that the creator hasn't collected yet."
            ],
            "type": "u64"
          },
          {
            "name": "totalPremiumsCollected",
            "type": "u64"
          },
          {
            "name": "totalClaimsPaid",
            "type": "u64"
          },
          {
            "name": "totalPolicies",
            "type": "u64"
          },
          {
            "name": "activePolicies",
            "docs": [
              "Policies that can still be paid out. `active_policies * coverage_amount`",
              "is the vault's outstanding exposure and must stay <= `total_liquidity`."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaims",
            "type": "u64"
          },
          {
            "name": "pendingClaims",
            "type": "u64"
          },
          {
            "name": "isPaused",
            "docs": [
              "Blocks new subscriptions only; never blocks renewals or claim settlement."
            ],
            "type": "bool"
          },
          {
            "name": "isClosed",
            "docs": [
              "Set once the creator has withdrawn after expiry."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "vaultClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amountWithdrawn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "triggerType",
            "type": {
              "defined": {
                "name": "triggerType"
              }
            }
          },
          {
            "name": "triggerThreshold",
            "type": "i64"
          },
          {
            "name": "coverageStart",
            "type": "i64"
          },
          {
            "name": "coverageEnd",
            "type": "i64"
          },
          {
            "name": "premiumAmount",
            "type": "u64"
          },
          {
            "name": "coverageAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "claimFilingGrace",
      "docs": [
        "Weather claims can be filed up to this long after paid coverage ends; the",
        "rainfall window always ends at the coverage end, so no uncovered day counts."
      ],
      "type": "i64",
      "value": "604800"
    },
    {
      "name": "claimStatusOffset",
      "docs": [
        "Byte offset of `Claim.status` (discriminator 8 + vault 32 + claimant 32 +",
        "policy 32 + claim_number 8). Off-chain sweeps filter on it."
      ],
      "type": "u64",
      "value": "112"
    },
    {
      "name": "forceWithdrawDelay",
      "docs": [
        "If claims are still pending this long after `vault_expiry` (oracle offline),",
        "the creator may withdraw anyway so funds are never locked forever."
      ],
      "type": "i64",
      "value": "604800"
    },
    {
      "name": "gracePeriod",
      "docs": [
        "How long after `personal_coverage_end` a policy can still be renewed."
      ],
      "type": "i64",
      "value": "864000"
    },
    {
      "name": "maxCreatorFeeBps",
      "docs": [
        "Creators can take at most 50% of each premium."
      ],
      "type": "u16",
      "value": "5000"
    },
    {
      "name": "maxObservationDays",
      "docs": [
        "Weather vaults measure rainfall over a trailing window of this many days (max)."
      ],
      "type": "u16",
      "value": "90"
    },
    {
      "name": "month",
      "docs": [
        "Length of one premium period."
      ],
      "type": "i64",
      "value": "2592000"
    },
    {
      "name": "oracleFee",
      "docs": [
        "Anti-spam fee charged when a claim is filed (0.005 USDC). Goes to the treasury."
      ],
      "type": "u64",
      "value": "5000"
    }
  ]
};
