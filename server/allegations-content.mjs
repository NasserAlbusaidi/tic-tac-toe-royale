export const allegationPacks = ['general', 'sensei', 'mixed']
export const allegationTones = ['friendly', 'feral']
export const allegationCaseCounts = [5, 7, 9]

export const allegationPackMetadata = {
  general: {
    label: 'General Chaos',
    description: 'Absurd accusations with universal jurisdiction.',
  },
  sensei: {
    label: 'Sensei on Trial',
    description: 'Tech support, X/O crimes, and weaponized chaos.',
  },
  mixed: {
    label: 'Mixed Evidence',
    description: 'A suspicious blend of Sensei evidence and general disorder.',
  },
}

export const allegationToneMetadata = {
  friendly: {
    label: 'Friendly',
    description: 'Silly charges. Minimal emotional damages.',
  },
  feral: {
    label: 'Feral',
    description: 'Sharper evidence about habits and chaotic behaviour.',
    warning: 'The court accepts no responsibility for damaged friendships.',
  },
}

export const ALLEGATION_PROMPTS = [
  {
    id: 'general-cult-snacks',
    text: 'Who would accidentally join a cult because the snacks were good?',
    charge: 'snack-motivated cult enrollment',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-apocalypse-charger',
    text: 'Who would survive the apocalypse but lose their charger on day one?',
    charge: 'catastrophic charger negligence',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-ikea-ban',
    text: 'Who would get banned from IKEA?',
    charge: 'furniture-related public disturbance',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-red-button',
    text: 'Who would press the mysterious red button before reading the warning?',
    charge: 'unauthorized button pressing',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-tabs-research',
    text: 'Who would open 37 tabs and call it research?',
    charge: 'reckless tab accumulation',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-almost-there',
    text: 'Who would say “I’m almost there” while still at home?',
    charge: 'fraudulent estimated arrival',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-holiday-incident',
    text: 'Who would cause an international incident during a holiday?',
    charge: 'vacation-based diplomacy failure',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-vending-machine',
    text: 'Who would start an argument with a vending machine?',
    charge: 'hostile negotiations with machinery',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-horror-villain',
    text: 'Who would befriend the villain in a horror movie?',
    charge: 'criminally poor threat assessment',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-confidence-misinformation',
    text: 'Who would survive entirely through confidence and misinformation?',
    charge: 'unlicensed confidence',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-gps-lost',
    text: 'Who would get lost while actively using GPS?',
    charge: 'aggravated navigation refusal',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-errand-side-quest',
    text: 'Who would turn a simple errand into a six-hour side quest?',
    charge: 'reckless itinerary expansion',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-microwave-clock',
    text: 'Who would argue with the microwave clock instead of setting it?',
    charge: 'temporal appliance misconduct',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-screenshot-context',
    text: 'Who would submit a group-chat screenshot with absolutely no context?',
    charge: 'reckless evidence presentation',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-rules-after-losing',
    text: 'Who would read the board-game rules only after losing?',
    charge: 'post-verdict rules discovery',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-airport-gate',
    text: 'Who would confidently wait at the wrong airport gate?',
    charge: 'unauthorized terminal confidence',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-meme-apology',
    text: 'Who would deliver a formal apology entirely through memes?',
    charge: 'meme-based remorse evasion',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-plant-delegation',
    text: 'Who would buy a plant and immediately delegate its care?',
    charge: 'botanical responsibility transfer',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-recipe-suggestion',
    text: 'Who would treat a recipe as a loose suggestion and blame the oven?',
    charge: 'culinary evidence tampering',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-stray-cat',
    text: 'Who would name a stray cat within thirty seconds of meeting it?',
    charge: 'premature feline administration',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-online-form',
    text: 'Who would open an online form in three tabs and submit none of them?',
    charge: 'administrative tab duplication',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-suitcase',
    text: 'Who would leave a suitcase packed until the next trip?',
    charge: 'long-term luggage occupation',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'general-reply-all',
    text: 'Who would turn one reply-all email into a constitutional crisis?',
    charge: 'aggravated inbox disorder',
    pack: 'general',
    tone: 'feral',
  },
  {
    id: 'general-weather-app',
    text: 'Who would debate the weather app while standing in the rain?',
    charge: 'meteorological evidence denial',
    pack: 'general',
    tone: 'friendly',
  },
  {
    id: 'sensei-ignore-tech-solution',
    text: 'Who would ask the Sensei for tech help, ignore the solution, then say it still does not work?',
    charge: 'weaponized helplessness',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-quick-question',
    text: 'Who would say “quick question” and create an entire side quest?',
    charge: 'unauthorized side-quest creation',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-game-cheating',
    text: 'Who would accuse the game of cheating the moment they lose?',
    charge: 'aggravated skill-issue denial',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-xo-bullying',
    text: 'Who would bully someone at X/O and call it personality?',
    charge: 'competitive emotional damage',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-wrong-buttons',
    text: 'Who would press every button except the one they were told to press?',
    charge: 'deliberate instruction evasion',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-new-rules',
    text: 'Who would challenge the Sensei, lose, then demand new rules?',
    charge: 'post-defeat constitutional amendment',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-bored-project',
    text: 'Who would say “I’m bored” and accidentally cause a week-long software project?',
    charge: 'reckless developer deployment',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-developer-dramatic',
    text: 'Who would call the developer dramatic after asking him to make an entire game?',
    charge: 'aggravated irony',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-one-trick',
    text: 'Who would learn one trick and immediately become unbearable?',
    charge: 'first-degree overconfidence',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-only-help',
    text: 'Who would send only “help” and expect a full technical diagnosis?',
    charge: 'emergency context withholding',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-topic-escape',
    text: 'Who would disappear mid-conversation and return with a completely unrelated topic?',
    charge: 'conversational hit-and-run',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-compliment-bullying',
    text: 'Who would somehow turn a compliment into bullying?',
    charge: 'unsolicited compliment weaponization',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-holding-evidence',
    text: 'Who would claim innocence while actively holding the evidence?',
    charge: 'possession of obvious evidence',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-regret-teaching',
    text: 'Who would make the Sensei regret teaching them anything?',
    charge: 'educational privilege abuse',
    pack: 'sensei',
    tone: 'friendly',
  },
  {
    id: 'sensei-redefine-winning',
    text: 'Who would lose, demand a rematch, then redefine what winning means?',
    charge: 'retroactive victory fabrication',
    pack: 'sensei',
    tone: 'feral',
  },
  {
    id: 'sensei-selective-memory',
    text: 'Who would quote the Sensei accurately only when it helps their case?',
    charge: 'selective Sensei citation',
    pack: 'sensei',
    tone: 'friendly',
  },
]

const promptsById = new Map(ALLEGATION_PROMPTS.map((prompt) => [prompt.id, prompt]))

export function getAllegationPrompt(id) {
  return promptsById.get(id) ?? null
}

export const verdictCopy = {
  single: {
    title: 'Certified Menace',
    sentence: 'Must admit the other suspect was right once.',
    appealStatus: 'Denied before it was submitted.',
  },
  joint: {
    title: 'Joint Criminal Enterprise',
    sentence: 'Both suspects must stop calling this a misunderstanding.',
    appealStatus: 'Merged into one extremely suspicious filing.',
  },
  none: {
    title: 'Insufficient Evidence, Excessive Suspicion',
    sentence: 'Released under permanent side-eye.',
    appealStatus: 'Unnecessary. The court is still watching.',
  },
}
