export type Equipment = 'dosa' | 'biryani' | 'thali' | 'wok' | 'burger' | 'pizza' | 'chai' | 'juice';

export interface MenuItem {
  id: string;
  name: string;
  pricePaise: number;
  veg: boolean;
  prepMin: number;
}

export interface ShopDef {
  id: string;
  name: string;
  code: string;
  tagline: string;
  /** Sign and accent colour (hex). */
  color: string;
  equipment: Equipment;
  /** Relative pull on diners; busy shops get longer queues. */
  popularity: number;
  menu: MenuItem[];
}

const item = (id: string, name: string, rupees: number, veg: boolean, prepMin: number): MenuItem => ({
  id,
  name,
  pricePaise: rupees * 100,
  veg,
  prepMin,
});

// Fictional shops for the demo court. Prices are whole rupees, stored in paise.
export const SHOPS: ShopDef[] = [
  {
    id: 'dosa-corner',
    name: 'Dosa Corner',
    code: 'DC',
    tagline: 'Crisp dosas off the tawa',
    color: '#f59e0b',
    equipment: 'dosa',
    popularity: 1.2,
    menu: [
      item('dc-masala', 'Masala Dosa', 90, true, 7),
      item('dc-ghee', 'Ghee Roast Dosa', 120, true, 8),
      item('dc-onion', 'Onion Rava Dosa', 110, true, 9),
      item('dc-idli', 'Idli Vada Combo', 70, true, 4),
      item('dc-uttapam', 'Tomato Uttapam', 100, true, 8),
      item('dc-podi', 'Podi Idli', 80, true, 5),
      item('dc-filter', 'Filter Coffee', 35, true, 2),
    ],
  },
  {
    id: 'biryani-house',
    name: 'Biryani House',
    code: 'BH',
    tagline: 'Dum biryani from the handi',
    color: '#c2410c',
    equipment: 'biryani',
    popularity: 1.4,
    menu: [
      item('bh-chicken', 'Chicken Dum Biryani', 220, false, 6),
      item('bh-mutton', 'Mutton Biryani', 310, false, 6),
      item('bh-veg', 'Veg Dum Biryani', 170, true, 6),
      item('bh-egg', 'Egg Biryani', 180, false, 5),
      item('bh-kebab', 'Chicken 65', 160, false, 9),
      item('bh-raita', 'Burani Raita', 40, true, 1),
      item('bh-phirni', 'Kesar Phirni', 70, true, 1),
    ],
  },
  {
    id: 'north-thali',
    name: 'North Thali',
    code: 'NT',
    tagline: 'Tandoor rotis and slow curries',
    color: '#dc2626',
    equipment: 'thali',
    popularity: 1.0,
    menu: [
      item('nt-thali', 'Punjabi Veg Thali', 190, true, 7),
      item('nt-paneer', 'Paneer Butter Masala', 180, true, 8),
      item('nt-dal', 'Dal Makhani Bowl', 150, true, 5),
      item('nt-chole', 'Chole Kulche', 130, true, 6),
      item('nt-butterchk', 'Butter Chicken', 240, false, 9),
      item('nt-naan', 'Butter Naan (2)', 60, true, 4),
      item('nt-lassi', 'Sweet Lassi', 60, true, 2),
    ],
  },
  {
    id: 'wok-momos',
    name: 'Wok & Momos',
    code: 'WM',
    tagline: 'Fire-wok noodles and steamed momos',
    color: '#0891b2',
    equipment: 'wok',
    popularity: 1.15,
    menu: [
      item('wm-vegmomo', 'Veg Steamed Momos', 100, true, 8),
      item('wm-chkmomo', 'Chicken Momos', 130, false, 8),
      item('wm-hakka', 'Veg Hakka Noodles', 140, true, 6),
      item('wm-schezwan', 'Schezwan Fried Rice', 150, true, 6),
      item('wm-chilli', 'Chilli Chicken', 190, false, 9),
      item('wm-manchurian', 'Gobi Manchurian', 140, true, 7),
      item('wm-soup', 'Hot & Sour Soup', 90, true, 4),
    ],
  },
  {
    id: 'burger-barn',
    name: 'Burger Barn',
    code: 'BB',
    tagline: 'Smash burgers and loaded fries',
    color: '#7c3aed',
    equipment: 'burger',
    popularity: 1.05,
    menu: [
      item('bb-classic', 'Classic Veg Burger', 120, true, 6),
      item('bb-smash', 'Chicken Smash Burger', 190, false, 8),
      item('bb-paneer', 'Tandoori Paneer Burger', 170, true, 8),
      item('bb-fries', 'Peri Peri Fries', 90, true, 5),
      item('bb-loaded', 'Loaded Cheese Fries', 140, true, 6),
      item('bb-wings', 'Hot Wings (6)', 210, false, 10),
      item('bb-shake', 'Cold Coffee', 110, true, 3),
    ],
  },
  {
    id: 'pizza-slice',
    name: 'Pizza Slice',
    code: 'PS',
    tagline: 'Stone-oven pizza by the slice',
    color: '#e11d48',
    equipment: 'pizza',
    popularity: 0.95,
    menu: [
      item('ps-margherita', 'Margherita Slice', 90, true, 4),
      item('ps-farmhouse', 'Farmhouse Slice', 120, true, 4),
      item('ps-pepperoni', 'Chicken Pepperoni Slice', 150, false, 4),
      item('ps-whole', 'Paneer Tikka Pizza (8")', 280, true, 11),
      item('ps-garlic', 'Garlic Bread', 100, true, 6),
      item('ps-pasta', 'Arrabbiata Pasta', 170, true, 9),
    ],
  },
  {
    id: 'chai-chaat',
    name: 'Chai & Chaat',
    code: 'CC',
    tagline: 'Cutting chai and street chaat',
    color: '#ca8a04',
    equipment: 'chai',
    popularity: 1.1,
    menu: [
      item('cc-chai', 'Masala Chai', 25, true, 2),
      item('cc-samosa', 'Samosa (2)', 40, true, 2),
      item('cc-panipuri', 'Pani Puri (6)', 50, true, 3),
      item('cc-papdi', 'Papdi Chaat', 70, true, 4),
      item('cc-vadapav', 'Vada Pav', 45, true, 3),
      item('cc-kachori', 'Raj Kachori', 90, true, 5),
      item('cc-bunmaska', 'Bun Maska', 40, true, 2),
    ],
  },
  {
    id: 'juice-shakes',
    name: 'Juice & Shakes',
    code: 'JS',
    tagline: 'Fresh juice, thick shakes',
    color: '#16a34a',
    equipment: 'juice',
    popularity: 0.9,
    menu: [
      item('js-mosambi', 'Fresh Mosambi Juice', 70, true, 3),
      item('js-watermelon', 'Watermelon Cooler', 70, true, 3),
      item('js-mango', 'Mango Shake', 110, true, 4),
      item('js-oreo', 'Oreo Thick Shake', 140, true, 4),
      item('js-coconut', 'Tender Coconut', 60, true, 2),
      item('js-sugarcane', 'Sugarcane Juice', 50, true, 3),
      item('js-faluda', 'Royal Falooda', 150, true, 5),
    ],
  },
];

export const SHOP_BY_ID: Record<string, ShopDef> = Object.fromEntries(SHOPS.map((s) => [s.id, s]));
