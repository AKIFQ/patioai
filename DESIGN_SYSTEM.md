# PatioAI Design System

## Color Palette
**Brand Colors Only - Forest & Cream**
- Primary: Forest Green (`--forest-base`, `--forest-600`, `--forest-700`) 
- Backgrounds: Cream shades (`--cream-100`, `--cream-200`, `--cream-300`)
- Success: Forest variants (`--forest-base` for positive states)
- Warning/Caution: Forest darker shades (`--forest-700`)
- Neutral: Muted variants (`muted`, `muted-foreground`)

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
- Use brand colors for accent icons (forest green for primary actions)
- Circular backgrounds for app icons: `w-8 h-8 rounded-full bg-muted`
- Forest green for primary action buttons: `bg-primary hover:bg-primary/90`
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