# Development notes

Living Dex (first called Holo Collector) is the Pokémon version of MTG Collector (public repo
bmead92/mtg-collector). It started as a fork of MTG Collector 1.0.0; git remote `mtg` points at the MTG repo
so shared fixes can be cherry-picked. Decisions: [DECISIONS.md](DECISIONS.md).

## Status

**1.0.5** (Nov 21, 2026; History shows cards not in a pack again), public repo bmead92/living-dex since 1.0.4, starting from a fresh history; development
history and releases 0.1.0–1.0.4 are in the private repo bmead92/living-dex-prerelease (local branch `pre-1.0`).
Local folder still `holo-collector`. Package `dev.holocollector.app` is kept from the first name: never change it,
that would wipe users' collections. Installs next to MTG Collector. Backups: Downloads › Living Dex (old Holo
Collector backups still restore and are pruned with the new ones).

Tested on the owner's phone with ~560 real Wizards-era cards (Base, Jungle, Fossil, Base Set 2, promos).

## What changed from MTG Collector

- **Data:** TCGdex (`api.tcgdex.net/v2/en`, free, no key, no published limits: be considerate, cache).
  `src/lib/cards.ts` is the client and maps TCGdex cards to the app's `Card`. One request per card (there is
  no batch price endpoint); requests are throttled (60 ms gap, 4 in parallel) and retried on 429 / 5xx.
- **Bundled catalog:** `src/data/catalog.json` (every paper set: id, name, printed code, official count,
  release date, series, symbol; every card's number and name). Built by `node scripts/make-catalog.mjs
  [cache-dir]`. Re-run when new sets come out (new sets are otherwise unknown to scanning and the pack
  picker). TCG Pocket (digital) sets are excluded.
- **Identification** (`src/lib/identify.ts`): Scarlet & Violet and newer print a set code ("SSP EN 100/191");
  older cards only "4/102". Candidates = cards with that number in sets with that code, or with that official
  count; the name read from the top picks between them (name + number + set size is unique for ~97% of
  cards). Falls back to the closest name in the catalog (offline fuzzy match).
- **OCR parser** (`src/lib/ocr.ts`): bottom lines → number / set size / code; top lines → name (skips STAGE,
  BASIC, Evolves from, HP, LV.), matched against catalog names.
- **Finishes:** `normal`, `holo`, `reverse`, `first` (1st Edition), `shadowless` (from `variants_detailed`, Base
  Set only). Holo-only cards with editions show "Unlimited / 1st Edition / Shadowless" (labels never wrap). Not detected automatically: the
  owner's Shadowless cards print the same copyright line as Unlimited, and the 1st Edition stamp isn't text.
  **Special versions** (1.0.2): `variants_detailed` entries with a `foil` (pokeball, masterball, energy, cosmos,
  cracked-ice, rainbow, tinsel…) or a `stamp` (set-logo, McDonald's, prerelease, 30th…) become extra finishes
  keyed `base+tag[+tag]` (`reverse+masterball`, `normal+set-logo`), priced from that variant's own pricing. Only
  standard-size variants with their own TCGplayer / Cardmarket product and a price; subtypes (errors, blue
  border, 1999-2000 copyright) stay out. `isFinish` validates keys in backups; filters match the base finish.
  Picked by hand (the pattern can't be read by OCR).
- **Old cards:** the number usually shares the copyright line ("…©1999 Wizards 102/102"); a second OCR pass reads
  the bottom strip enlarged 2× when the number is missed. Without a number: copyright year, then old-layout
  wording ("Pokémon Power", "Length/Weight", "TRAINER"), then the era of the other cards in the session pick
  the printing. Base Set Energy prints only "ENERGY": the number decides; "r Energy" style partial reads map to
  basic types.
- **Prices:** TCGplayer market (USD) is the main price; Cardmarket trend (EUR) on the card page. Keys per
  finish in `TCG_KEYS` (`normal`/`unlimited`, `holofoil`/`unlimited-holofoil`, `reverse-holofoil`,
  `1st-edition(-holofoil)`). Condition does not change the price (TCGdex has no condition prices).
  `price_cents` = market, `low_cents` = TCGplayer low, `other_prices` = JSON of every finish's prices.
  No TCGplayer price → Cardmarket trend × `EUR_TO_USD` (1.1, `fromEur` flag; owner's call). TCGdex has no TCGplayer
  price for Shadowless and its Cardmarket listing mixes in 1st Edition sales (Hitmonchan €269 trend vs ~$100 real),
  so Base Set Shadowless and 1st Edition come from TCGplayer's own "Base Set (Shadowless)" products via TCGCSV
  (`src/lib/tcgcsv.ts`: tcgcsv.com/tcgplayer/3/1663 products + prices, a free daily TCGplayer mirror, fetched once
  per 6 h when a Base Set card is looked up; matched by card number; subtypes Unlimited (Holofoil) = Shadowless,
  1st Edition (Holofoil) = 1st Edition). If TCGCSV fails, Shadowless falls back to the Unlimited price as a floor
  (`unlimited` flag, noted on the card page) (1.0.3).
- **Refresh:** cards priced in the last 6 h are recomputed from their stored `other_prices` (no request); the rest
  are fetched (6 in parallel, 60 ms apart). Tools → Refresh all prices fetches everything, and so does the first
  refresh after `PRICE_RULES` (in `pricing.ts`) is bumped: bump it whenever pricing rules change.
- **Your own price:** `price_locked` = 1 keeps `price_cents` through refreshes and merges (Set your own price on
  the card page). **Set condition** (Tools) changes every card shown and merges rows that become identical.
- **Packs (shared with MTG Collector 1.0.1):** Scan asks singles or pack / box first; Select on the Stack saves
  part of it to a pack; **History** (`/history`) lists every addition with its pack and moves selected ones to
  a pack or back to singles. Back-to-top button; the collection jumps to the top after a minute away. See
  MTG Collector's DEVELOPMENT.md "Opened packs / boxes".
- **Search by name** (`/add`, from the Scan sheet or the Stack): offline `searchNames` → printing picker →
  `enqueueCard` adds it to the Stack (priced when it lands). Pack page: Add cards (History with `into`) and Edit.
- **Rarity tiers:** `src/lib/rarity.ts` (TCGdex paper rarities → tier, short label, colour; sort by rarity).
- **Type icons:** `src/components/EnergyIcon.tsx`, hand-drawn glyphs (not the official energy symbols).
- **Sealed:** no free sealed prices. The pack picker lists booster sets from the catalog with Booster Pack /
  Booster Box (36) / Elite Trainer Box (9, sets from Aug 2011) / Booster Bundle (6, from 2019); the user types
  what they paid.
- **Removed:** deck import / precons, foreign-language cards, Mana Pool, Scryfall. The `precon` source kind
  stays (labelled "Decks").
- **Known data gaps** (TCGdex): ~20% of older cards have no USD price; Crown Zenith Galarian Gallery and
  Shining Fates Shiny Vault have no USD price or image; some printings share one marketplace listing.

## Build

Same toolchain and gotchas as MTG Collector (see its docs/DEVELOPMENT.md): JDK 17 at
`%LOCALAPPDATA%\Programs\Temurin\jdk-17.0.21+9`, `npx expo prebuild` then rewrite `android/local.properties`
(`sdk.dir`, `cmake.dir`), R8 off, release signing from `~/.gradle/gradle.properties` (same private key as
MTG Collector), install with `scripts/install-apk.sh`.
