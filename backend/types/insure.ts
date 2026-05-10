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
      "name": "creatorWithdraw",
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
                "path": "vault.vault_id",
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
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "usdcMint"
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
                "path": "vault.vault_id",
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
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "depositAmount",
          "type": "u64"
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
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
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
                "path": "vault.vault_id",
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
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
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
                "path": "vault.vault_id",
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
                "path": "policy.claim_count",
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
          "name": "usdcMint"
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
          "name": "claimData",
          "type": {
            "defined": {
              "name": "claimData"
            }
          }
        }
      ]
    },
    {
      "name": "settleClaim",
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
                "path": "claim.claim_number",
                "account": "claim"
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
                "path": "vault.vault_id",
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
                "path": "policy.owner",
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
          "name": "quoteAccount"
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
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "subscribe",
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
                "path": "vault.vault_id",
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
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
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
      "name": "liquidityWithdrawnAndVaultPaused",
      "discriminator": [
        9,
        247,
        193,
        85,
        15,
        144,
        249,
        40
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
      "msg": "The time you entered is invalid!"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount!"
    },
    {
      "code": 6002,
      "name": "vaultPaused",
      "msg": "Vault is paused"
    },
    {
      "code": 6003,
      "name": "subscriptionClosed",
      "msg": "Subscription is closed right now"
    },
    {
      "code": 6004,
      "name": "alreadySubscribed",
      "msg": "You already have subscribed for this insurance"
    },
    {
      "code": 6005,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in the vault, please check after after hours"
    },
    {
      "code": 6006,
      "name": "unauthorised",
      "msg": "Unauthorised access"
    },
    {
      "code": 6007,
      "name": "invalidMint",
      "msg": "Provided USDC mint address is different from what was stored"
    },
    {
      "code": 6008,
      "name": "notSubscribed",
      "msg": "Not subscribed"
    },
    {
      "code": 6009,
      "name": "outsideCoverageWindow",
      "msg": "You are trying to pay premium outside the coverage window"
    },
    {
      "code": 6010,
      "name": "coverageLapsed",
      "msg": "Your insurance coverage is lapsed, please buy any other premium"
    },
    {
      "code": 6011,
      "name": "claimApproved",
      "msg": "This claim was already approved"
    },
    {
      "code": 6012,
      "name": "claimRejected",
      "msg": "This claim was rejected"
    },
    {
      "code": 6013,
      "name": "invalidOracleResult",
      "msg": "Invalid oracle result"
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
            "name": "claimNumber",
            "type": "u64"
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
            "name": "status",
            "type": {
              "defined": {
                "name": "claimStatus"
              }
            }
          },
          {
            "name": "payoutAmount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "claimData",
            "type": {
              "defined": {
                "name": "claimData"
              }
            }
          }
        ]
      }
    },
    {
      "name": "claimData",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "weather",
            "fields": [
              {
                "name": "latitude",
                "type": "f64"
              },
              {
                "name": "longitude",
                "type": "f64"
              }
            ]
          },
          {
            "name": "flightDelay",
            "fields": [
              {
                "name": "flightNumber",
                "type": "string"
              },
              {
                "name": "flightDate",
                "type": "i64"
              }
            ]
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
            "name": "verdict",
            "type": "bool"
          },
          {
            "name": "payoutAmount",
            "type": "u64"
          },
          {
            "name": "oracleValue",
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
      "name": "liquidityDeposited",
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
            "name": "depositAmount",
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
      "name": "liquidityWithdrawnAndVaultPaused",
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
            "name": "totalPremiumsPaid",
            "type": "u64"
          },
          {
            "name": "personalCoverageEnd",
            "type": "i64"
          },
          {
            "name": "isSubscribed",
            "type": "bool"
          },
          {
            "name": "claimCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
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
            "name": "premiumAmount",
            "type": "u64"
          },
          {
            "name": "coverageAmount",
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
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "totalLiquidity",
            "type": "u64"
          },
          {
            "name": "isPaused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
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
            "name": "totalPolicies",
            "type": "u64"
          },
          {
            "name": "totalClaims",
            "type": "u64"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "vaultId",
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
  ]
};
