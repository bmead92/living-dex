# Decisions

- **Separate app, separate private repo, forked from MTG Collector.** Legal isolation (The Pokémon Company
  has no fan content policy; a takedown here can't touch MTG Collector), existing MTG users unaffected, and
  no risky refactor of the MTG app. Shared fixes are cherry-picked from the `mtg` remote.
- **Name: "Living Dex"** (owner's pick; was "Holo Collector"). A fan term; no app found with that name.
  Nothing trademarked in the name or icon: no "Pokémon", no Pokéball. Icon (owner's request): a red handheld card-dex with a lens, lights and a card on its screen, hand-coded geometry (`scripts/make-icons.cjs`), no AI art or others' artwork.
- **Free, $0 to run:** TCGdex for data, images and prices (free, MIT data), GitHub Releases for the APK,
  optional Ko-fi. No server.
- **TCGplayer market price is the headline** (USD), Cardmarket (EUR) shown on the card page.
- **English cards only** for now.
- **Card matching works offline** from a bundled catalog; one request then fetches the card and its price.
- **No sealed prices** (no free source): the user enters what they paid for packs and boxes.
- **No TCGplayer price → Cardmarket, converted** (owner's call), e.g. Black Star promos. Not Shadowless: its Cardmarket
  listing mixes in 1st Edition sales; Base Set Shadowless / 1st Edition prices come from TCGCSV (TCGplayer's own
  Shadowless products, the owner found them), with the Unlimited price as a fallback floor.
- **Your own price** for cards the data gets wrong; **Set condition** for many cards at once (childhood cards
  are rarely Near Mint).
- **Special versions with their own listing are finishes** (Poké Ball / Master Ball reverse, Cosmos, stamps):
  they sell for very different prices. Versions without their own price are left out.
- **Special old printings** (error stamps, gold border, "1999-2000" copyright, W stamp) are not finishes:
  TCGdex has no separate prices for them, so they'd add choices without changing values.
