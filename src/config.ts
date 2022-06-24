import {
  Config as MangoConfig,
  IDS as MANGO_MARKETS,
} from '@blockworks-foundation/mango-client'
import { MARKETS as SERUM_MARKETS } from '@project-serum/serum'

export type Protocol = 'mango' | 'serum'

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
  }
}
