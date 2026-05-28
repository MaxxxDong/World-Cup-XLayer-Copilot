# Market Rules

## Outcomes

Each market has exactly three tradable outcomes:

- `TeamA`: Team A wins.
- `TeamB`: Team B wins.
- `Draw`: the match ends in a draw.

The exact match timing rule must be displayed per market before launch. MVP default:

> Result is based on regular time only unless a market explicitly says otherwise.

## Odds

Odds are pool-implied and read from the contract:

```text
distributablePool = totalPool - fee
outcomeOdds = distributablePool / outcomePool
```

The frontend should display odds as `oddsBps / 10000`.

If an outcome pool is zero, displayed odds should be `--` because no one can claim that outcome yet.

The contract also rejects non-`Void` settlement to an outcome whose pool is zero. If the official result has no winning pool in the MVP, the operator must resolve the market as `Void` so every participant can refund their original stake. This avoids locking real USDT0 in the contract.

## Caps

Every market has:

- `maxTotalPool`: maximum total USDT0 accepted by the market.
- `maxUserStake`: maximum total USDT0 a single address can contribute to that market.

These caps are enforced on-chain.

## Close

Buying is disabled when either:

- the owner closes the market, or
- the current block timestamp reaches `closeTime`.

## Settlement

For MVP, settlement is manual:

- Owner resolves to `TeamA`, `TeamB`, `Draw`, or `Void`.
- Resolution must be based on official match results.
- Non-`Void` resolution requires a nonzero winning pool.
- `Void` refunds each user their original total stake.

Production versions should replace the owner with a multisig and later a verified resolver/oracle.

## Polymarket Reference

Polymarket data may be shown as:

- external reference signal,
- market sentiment,
- comparison against X Layer pool-implied odds.

Polymarket must not decide settlement and must not be described as the source of X Layer odds.
