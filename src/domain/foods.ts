export interface FoodCategory {
  label: string
  emoji: string
  foods: string[]
}

export const FIRST_FOODS: FoodCategory[] = [
  {
    label: 'Fruits',
    emoji: '🍌',
    foods: ['Banana', 'Avocado', 'Apple', 'Pear', 'Peach', 'Mango', 'Blueberry', 'Prune', 'Plum'],
  },
  {
    label: 'Vegetables',
    emoji: '🥕',
    foods: ['Sweet potato', 'Carrot', 'Peas', 'Green bean', 'Butternut squash', 'Broccoli', 'Zucchini', 'Spinach', 'Cauliflower'],
  },
  {
    label: 'Grains',
    emoji: '🌾',
    foods: ['Oatmeal', 'Rice cereal', 'Barley', 'Quinoa', 'Whole-wheat toast', 'Pasta', 'Teething cracker'],
  },
  {
    label: 'Protein',
    emoji: '🍳',
    foods: ['Egg yolk', 'Scrambled egg', 'Chicken', 'Turkey', 'Beef', 'Tofu', 'Lentils', 'Plain yogurt', 'Cheese', 'Peanut butter (thin)'],
  },
]

export const FIRST_FOOD_FLAT = FIRST_FOODS.flatMap((c) => c.foods).sort()