declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react'

  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & {
    size?: string | number
    strokeWidth?: number
    absoluteStrokeWidth?: boolean
  }>

  export const Activity: LucideIcon
  export const Apple: LucideIcon
  export const ArrowDownLeft: LucideIcon
  export const ArrowRight: LucideIcon
  export const BadgeCheck: LucideIcon
  export const Banknote: LucideIcon
  export const Bell: LucideIcon
  export const Boxes: LucideIcon
  export const CalendarDays: LucideIcon
  export const Check: LucideIcon
  export const ChevronDown: LucideIcon
  export const CircleHelp: LucideIcon
  export const ClipboardList: LucideIcon
  export const Command: LucideIcon
  export const CreditCard: LucideIcon
  export const Download: LucideIcon
  export const Eye: LucideIcon
  export const EyeOff: LucideIcon
  export const FileBarChart: LucideIcon
  export const HeartHandshake: LucideIcon
  export const Leaf: LucideIcon
  export const LogOut: LucideIcon
  export const Menu: LucideIcon
  export const MessageCircle: LucideIcon
  export const Moon: LucideIcon
  export const Package: LucideIcon
  export const Plus: LucideIcon
  export const Settings2: LucideIcon
  export const ShieldCheck: LucideIcon
  export const ShoppingBasket: LucideIcon
  export const Sun: LucideIcon
  export const Truck: LucideIcon
  export const UserRound: LucideIcon
  export const Users: LucideIcon
  export const X: LucideIcon
}
