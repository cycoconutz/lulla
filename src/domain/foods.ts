import { Apple, Carrot, Wheat, Egg, type LucideIcon } from 'lucide-react'

export interface FoodCategory {
  label: string
  Icon: LucideIcon
  foods: string[]
}

export const FIRST_FOODS: FoodCategory[] = [
  {
    label: 'Fruits',
    Icon: Apple,
    foods: ['Banana', 'Avocado', 'Apple', 'Pear', 'Peach', 'Mango', 'Blueberry', 'Prune', 'Plum'],
  },
  {
    label: 'Vegetables',
    Icon: Carrot,
    foods: ['Sweet potato', 'Carrot', 'Peas', 'Green bean', 'Butternut squash', 'Broccoli', 'Zucchini', 'Spinach', 'Cauliflower'],
  },
  {
    label: 'Grains',
    Icon: Wheat,
    foods: ['Oatmeal', 'Rice cereal', 'Barley', 'Quinoa', 'Whole-wheat toast', 'Pasta', 'Teething cracker'],
  },
  {
    label: 'Protein',
    Icon: Egg,
    foods: ['Egg yolk', 'Scrambled egg', 'Chicken', 'Turkey', 'Beef', 'Tofu', 'Lentils', 'Plain yogurt', 'Cheese', 'Peanut butter (thin)'],
  },
]

export const FIRST_FOOD_FLAT = FIRST_FOODS.flatMap((c) => c.foods).sort()