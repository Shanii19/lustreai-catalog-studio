## Lixea, AI Jewelry Visualization and Catalog Generation Platform

## Design System

- **Dark luxury theme**: Obsidian background (#0A0A0B), champagne gold accents (#C9A96E), off-white text (#F5F0E8), warm gray cards (#141414)
- **Typography**: Playfair Display (headings) + DM Sans (body) via Google Fonts
- **Details**: 12px card radius, 8px button radius, gold glow hovers, smooth 300ms transitions, fade-in animations

## Pages & Routes

### Landing Page (`/`)

1. **Fixed Navbar** — "LustreAI" logo (gold Playfair Display + diamond icon), nav links (Features, Pricing, Dashboard), Login + "Get Started" CTA buttons
2. **Hero Section** — Large headline "Turn Raw Jewelry Photos Into Catalog-Ready Visuals — Instantly", subheadline about AI rendering & 4K zoom, "Start Free Trial" primary CTA with gold gradient, "See Examples" secondary link, subtle background radial glow
3. **Features Grid** — 6 premium cards with icons: AI Enhancement, Model Rendering, 4K Zoom Shots, Multi-angle Views, PNG Export, Cloud Storage
4. **Minimal Footer** — Logo, nav links, copyright

### Auth Pages

- `/login` — Clean login form with email/password, gold accents
- `/signup` — Registration form matching the luxury aesthetic

### App Pages (placeholder shells)

- `/dashboard` — Dashboard layout placeholder
- `/project/:id` — Project detail placeholder

## Implementation

- Update CSS variables and Tailwind config for the luxury color palette
- Import Google Fonts in index.html
- Create shared layout components (Navbar, Footer)
- Build each page as a separate route component
- All Tailwind, fully responsive, premium feel throughout