// 50 adjectives x 50 foods = 2,500 clean, fun, food-court friendly combinations

export const ADJECTIVES = [
  'Zesty', 'Crispy', 'Golden', 'Spicy', 'Tangy',
  'Sweet', 'Sizzling', 'Sunny', 'Toasty', 'Cheesy',
  'Crunchy', 'Velvet', 'Savory', 'Bubbly', 'Peppy',
  'Fiery', 'Mellow', 'Gentle', 'Jolly', 'Merry',
  'Breezy', 'Cozy', 'Lively', 'Radiant', 'Sparky',
  'Smoky', 'Dapper', 'Speedy', 'Happy', 'Brave',
  'Royal', 'Clever', 'Charming', 'Witty', 'Nimble',
  'Lucky', 'Bright', 'Playful', 'Vibrant', 'Snappy',
  'Fluffy', 'Silky', 'Glazed', 'Roasted', 'Buttery',
  'Honeyed', 'Minty', 'Frosted', 'Wholesome', 'Zippy',
] as const;

export const FOODS = [
  'Mango', 'Dosa', 'Biriyani', 'Samosa', 'Chutney',
  'Paneer', 'Shawarma', 'Kebab', 'Parota', 'Noodle',
  'Lassi', 'Chai', 'Vada', 'Idli', 'Gulab',
  'Halwa', 'Pepper', 'Roll', 'Kulfi', 'Jalebi',
  'Tikka', 'Pakoda', 'Bhatura', 'Curry', 'Khichdi',
  'Upma', 'Pulao', 'Poori', 'Badam', 'Falooda',
  'Tender Coconut', 'Avocado', 'Pineapple', 'Corn', 'Mushroom',
  'Cashew', 'Pista', 'Ginger', 'Cardamom', 'Cumin',
  'Ghee Roast', 'Uttapam', 'Rasam', 'Sambar', 'Payasam',
  'Barfi', 'Laddu', 'Momos', 'Waffle', 'Brownie',
] as const;

/**
 * Deterministically or randomly select an Adjective + Food display name.
 */
export function generateDisplayName(seed?: number): string {
  const adjIndex =
    seed !== undefined
      ? Math.abs(seed) % ADJECTIVES.length
      : Math.floor(Math.random() * ADJECTIVES.length);
  const foodIndex =
    seed !== undefined
      ? Math.abs(Math.floor(seed / ADJECTIVES.length)) % FOODS.length
      : Math.floor(Math.random() * FOODS.length);

  return `${ADJECTIVES[adjIndex]} ${FOODS[foodIndex]}`;
}
