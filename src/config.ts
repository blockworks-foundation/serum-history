import {
  Config as MangoConfig,
  IDS as MANGO_MARKETS,
} from '@blockworks-foundation/mango-client'
import { MARKETS as SERUM_MARKETS } from '@project-serum/serum'

export type Protocol = 'mango' | 'serum' | 'test'

export function loadMarkets(protocol: Protocol): Record<string, string> {
  switch (protocol) {
    case 'mango': {
      const mangoGroupConfig = new MangoConfig(MANGO_MARKETS).getGroup(
        'mainnet',
        'mainnet.1'
      )
      return Object.fromEntries(
        mangoGroupConfig!.spotMarkets.map((spotMarketConfig) => {
          return [spotMarketConfig.name, spotMarketConfig.publicKey.toBase58()]
        })
      )
    }
    case 'serum': {
      const programId = loadProgramId(protocol)
      return Object.fromEntries(
        SERUM_MARKETS.filter((marketConfig) => {
          return (
            marketConfig.deprecated == false &&
            marketConfig.programId.toBase58() === programId
          )
        }).map((marketConfig) => {
          return [marketConfig.name, marketConfig.address.toBase58()]
        })
      )
    }
    case 'test': {
      return {
        'BTC/USDT': 'C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4',
        'ETH/USDT': '7dLVkUfBVfCGkFhSXDCq1ukM9usathSgS716t643iFGF',

        'BTC/USDC': 'A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw',
        'ETH/USDC': '4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX',
        'SOL/USDC': '9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT',
        'SRM/USDC': 'ByRys5tuUWDgL73G8JBAEfkdFf8JWBzPBDHsBVQ5vbQA',

        'MCAPS/USDC': 'GgzXqy6agt7nnfoPjAEAFpWqnUwLBK5r2acaAQqXiEM8',
        'MNGO/USDC': '3d4rzwpy9iGdCZvgxcu7B1YocYffVLsQXPXkBZKt2zLc',

        'USDT/USDC': '77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS',
        'FTT/USDC': '2Pbh1CvRVku1TgewMfycemghf6sU9EyuFDcNXqvRmSxc',
        'RAY/USDC': '2xiv8A5xrJ7RnGdxXB42uFEkYHJjszEhaJyKKt4WaLep',
        'COPE/USDC': '6fc7v3PmjZG9Lk2XTot6BywGyYLkBQuzuFKd4FpCsPxk',
        'SBR/USDC': 'HXBi8YBwbh4TXF6PjVw81m8Z3Cc4WBofvauj5SBFdgUs',
        'STEP/USDC': '97qCB4cAVSTthvJu3eNoEx6AY6DLuRDtCoPm5Tdyg77S',

        /*
        'CCAI/USDC': '7gZNLDbWE73ueAoHuAeFoSu7JqmorwCLpNTBXHtYSFTa',
        'FIDA/USDC': 'E14BKBhDWD4EuTkWj1ooZezesGxMW8LPCps4W5PuzZJo',
        'MER/USDC': 'G4LcexdCzzJUKZfqyVDQFzpkjhB1JoCNL8Kooxi9nJz5',
        'renDOGE/USDC': '5FpKCWYXgHWZ9CdDMHjwxAfqxJLdw2PRXuAmtECkzADk',
        'SLRS/USDC': '2Gx3UfV831BAh8uQv1FKSPKS9yajfeeD8GJ4ZNb2o2YP',
        'SNY/USDC': 'DPfj2jYwPaezkCmUNm5SSYfkrkz8WFqwGLcxDDUsN3gA',
        'TULIP/USDC': '8GufnKq7YnXKhnB3WNhgy5PzU9uvHbaaRrZWQK6ixPxW',
        */
      }
    }
  }
}

export function loadProgramId(protocol: Protocol): string {
  switch (protocol) {
    case 'mango': {
      return '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
    }
    case 'serum': {
      return '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
    }
    case 'test': {
      return '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
    }
  }
}
