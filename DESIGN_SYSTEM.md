# PatioAI Design System

## Color Palette
**Brand Colors Only - No Blue**
- Primary: Amber (`amber-500`, `amber-600`, `amber-50`)
- Success: Green (`green-500`, `green-600`, `green-50`) 
- Danger: Red (`red-500`, `red-600`, `red-50`)
- Neutral: Gray (`gray-500`, `gray-600`, `gray-50`, `muted-foreground`)

## Typography
- Headers: `font-medium` (never `font-bold`)
- Body: `text-sm`, `text-base`
- Muted: `text-muted-foreground/80`
- Labels: `text-xs font-medium uppercase tracking-wide`

## Spacing & Layout
- Consistent gaps: `gap-2`, `gap-3`, `gap-4`
- Padding: `p-4`, `p-6` for containers
- Rounded corners: `rounded-lg`, `rounded-xl`
- Borders: `border-border/40` for subtle borders

## Interactive Elements
- Buttons: `hover:bg-muted/50`, `transition-all duration-200`
- Scale effects: `hover:scale-105 active:scale-95`
- Focus: Subtle, not blue rings

## Modal Design Philosophy
- Clean backgrounds: `bg-background/95 backdrop-blur-md`
- Minimal headers with icon in branded circle
- No decorative elements (locks, emojis, generic icons)
- Purposeful spacing and clean information hierarchy
- Single-purpose modals (no multi-step complexity in one modal)

## Icons & Visual Elements
- Use brand colors for accent icons (amber for primary actions)
- Circular backgrounds for app icons: `w-8 h-8 rounded-full bg-white`
- No lock icons, shields, or security decorations
- Modern social media icons in clean circular containers