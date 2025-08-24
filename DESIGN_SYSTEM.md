# PatioAI Design System

## Color Palette
**Brand Colors Only - No Blue**
- Primary: Amber (`amber-500`, `amber-600`, `amber-50`) all shades of amber 
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

Minimalist Modern UI Style Guide
Use this text to explain the design approach to any LLM:

Design Philosophy: "Clean Minimalism with Purposeful Elements"

Create interfaces that are visually clean, functionally focused, and aesthetically modern. Follow these principles:

Visual Hierarchy:

Use subtle typography weights (font-medium, not font-bold)
Implement proper spacing with consistent gaps (gap-2, gap-3)
Apply muted colors for secondary information (text-muted-foreground/80)
Center content with max-width containers for better focus
Interactive Elements:

Use ghost/outline button variants for secondary actions
Implement smooth transitions and hover states
Keep button sizes compact (size="sm", h-8)
Hide non-essential text on mobile (hidden sm:inline)
Modern Aesthetics:

Apply subtle backdrop blur effects (backdrop-blur-md)
Use semi-transparent backgrounds (bg-background/80)
Add gentle border opacity (border-border/40)
Include purposeful micro-animations (animate-pulse for status)
Content Strategy:

Show only essential information
Remove redundant labels and verbose text
Use contextual indicators (colored dots, simple counters)
Prioritize scannable, digestible content
Responsive Design:

Hide secondary details on smaller screens
Maintain functionality across all device sizes
Use flexible layouts with proper breakpoints
Ensure touch-friendly interaction areas
Key Principle: Every element should serve a clear purpose. If it doesn't add functional or aesthetic value, remove it. The interface should feel spacious, intentional, and effortless to use.