# Mobile-first Flip Setups (this release)

## What was added
- **Dedicated phone/tablet app** (`components/flow/*`). Under 1024px wide the page now opens this instead of the desktop terminal.
  Bottom nav: **Main Trend · Signals · Setups · Charts · Settings**. Works from 320px, portrait + landscape, no horizontal page scroll.
  Desktop (>= 1024px) keeps the classic terminal and gets a new **Flip Setups** tab showing the same five screens.
  On a phone, Settings has a button to open the classic terminal; the classic view has a "Mobile view" button back.
- **1M -> 3M flip-sequence engine** (`lib/flow-engine.ts`, `lib/flow-eval.ts`, `/api/flow`). The project had none of this before.
  - Closed candles only. 3M candles are wall-clock aligned (same buckets as Binance/TradingView); 5M is native Binance 5m.
  - Sequence: 1M Supertrend flips -> MA/VIDYA check -> 3M Supertrend flips the same way within the expiry -> filters -> CONFIRMED or CANCELLED.
  - Cancelled with a stored reason when: 1M reverses first, the 3M flips after expiry, nothing happens before expiry, or a required filter fails.
  - Filters: main trend rule (5M Supertrend, optionally + 5M EMA99), 3M MA ribbon (EMA fast/mid/slow stack), 1M VIDYA, ADX(14) on 3M, 3M volume vs previous-20 average.
  - Grade A-D from a fixed 0-100 score (main trend 25, ribbon 25, VIDYA 20, ADX 15, volume 15; A>=85, B>=70, C>=55). Grade does not change when you toggle filters.
  - Universe: top 80 USDT-M perpetuals by 24h volume (BTCUSDT always included).
- **Charts** (`/api/klines`): native Binance 1m/3m/5m candles, EMA 7/25/99, Supertrend, VIDYA, volume, drag-to-pan, pinch/buttons zoom, tap-for-OHLC, full-screen.
- **Popups / notifications** only for fully CONFIRMED setups. Pending setups and early 1M flips never pop up. Browser notification + sound are optional and permission-gated (Android uses the service worker; iPhone only after "Add to Home Screen").
- **Settings** (collapsible, touch-sized, saved in localStorage): MA ribbon, Supertrend, VIDYA, ADX/volume, main trend rule, expiry, notifications. Save + Reset to Defaults.
- `tests/flow-engine.test.ts` - engine/evaluation tests on synthetic candles: `npx tsx tests/flow-engine.test.ts`.

## Things to know (honest limits)
- **VIDYA** is the standard Chande CMO-based VIDYA. It is *not* a port of the TradingView "Volumatic VIDYA" script (no source was provided).
- A setup needs a real **3M flip** after the 1M flip. A 1M flip while the 3M is already in that direction is not treated as a sequence.
- 5M EMA99 uses the last 300 native 5m candles; the card shows a warning if fewer than 99 bars exist.
- Data refreshes every 15s; the server re-fetches Binance candles at most every 20s and always after a new minute begins. There is no background push: popups/notifications fire while the page is open (or backgrounded but alive), not when the browser is fully closed.
- Edge function, same as `/api/market`: Binance blocks US IPs, so keep `vercel.json` region `sin1`.
- Mobile layout was verified with Playwright at 320/390/820 px and landscape against mock API data (Binance is not reachable from the build sandbox). Please do a real-device pass after deploying.

---

# What was actually wrong, and what changed

## Root causes found
1. **Not using Binance at all.** `/api/market` was pulling from CoinGecko (spot market, top 100 by market cap), not Binance Futures.
2. **No real Supertrend.** The "Supertrend" was actually EMA+RSI+slope voting on fake mini price windows — never an ATR-based Supertrend. That's why it looked frozen: it wasn't a real indicator to begin with.
3. **Fake timeframes.** CoinGecko only gives 7-day hourly data, but the code sliced it into tiny windows and labeled them "1M/3M/5M" as if they were 1-minute candles. Completely mislabeled.
4. **Silent fake data fallback.** If CoinGecko failed or rate-limited, the app quietly generated randomized synthetic prices and displayed them as if real (`live:false` flag existed but wasn't obvious in the UI).
5. **Broken repo structure** (in the *other* repo you first sent me) — files were flat when imports expected `app/`, `lib/`, `components/` folders. That repo would fail to build from a fresh clone.
6. **No trade-freeze / auto SL-TP.** This specific repo (`new-project-my`) didn't have the auto-close-on-SL/TP feature yet — I ported it over from your other repo, where it did already work correctly.

## What's fixed now
- **Real Binance USDT-M Futures data**: `lib/binance.ts` pulls the full list of live PERPETUAL/USDT contracts (250-300+, exceeds your "100+" ask) plus real 1H candles.
- **Real ATR-based Supertrend**: `lib/indicators.ts` implements the actual algorithm (period 10, multiplier 3) with proper band-flip logic — verified with a runtime test that it correctly flips direction when price action actually reverses.
- **Honest timeframes**: relabeled to `4H / 12H / 1D / 2D`, built by resampling real 1H candles (not fake slices).
- **No more fake data**: if Binance is unreachable, the UI now says so explicitly ("DATA UNAVAILABLE") instead of quietly showing synthetic numbers.
- **Trade freeze + live PnL**: entry/stop/target lock the moment you log a trade; only price and P&L update live every 15s (unchanged behavior, now fed by real Binance prices).
- **Rate-limit safe**: signal/Supertrend recompute is cached for 3 minutes (klines are heavy); price ticks refresh every 15s via one cheap bulk endpoint.
- **PWA / mobile install**: added `manifest.json`, a minimal service worker, and app icons so you can "Add to Home Screen" on iOS/Android and it opens like a native app.

## Honest limitation
"Accurate signals only" isn't something any system can promise — I tightened the confluence logic (Supertrend + RSI + MACD must agree, and 3-of-4 timeframes must align) so it should throw fewer, higher-quality signals, but losses will still happen. Treat the score as a filter, not a guarantee.
