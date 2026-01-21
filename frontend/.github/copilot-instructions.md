# SE347 Frontend - AI Agent Instructions

## Project Overview
SE347-FE is a **multi-role POS/Store Management System** built with React 19 + TypeScript + Vite. The application serves three distinct user roles (Admin, Cashier, Employee) with role-based access to different functionality.

**Key Facts:**
- Frontend framework: React 19 with TypeScript (mixed JSX/TSX files)
- Build tool: Vite with HMR support
- Styling: Tailwind CSS + custom HSL theme variables
- HTTP client: Axios with Bearer token auth (auto-injected from localStorage)
- Routing: React Router v7 with three role-based layout roots

## Architecture Patterns

### Role-Based Layout System
The app uses a **layout-based architecture** where each user role has a dedicated layout container:
- **AdminLayout** (`src/layouts/AdminLayout.jsx`) - Strategic operations (Products, Shops, Users, Orders, Purchase Orders, Inventory, Transfer, Promotions)
- **CashierLayout** (`src/layouts/CashierLayout.jsx`) - POS transactions + shift management via ShiftProvider context
- **EmployeeLayout** (`src/layouts/EmployeeLayout.jsx`) - Store manager functions (subset of admin)

Each layout uses a `currentView` state to switch between pages without routing changes, reducing navigation complexity. Menu items are component references, not route objects.

### Component Structure
- **Pages** (`src/pages/`): Full-page views imported as components into layouts
- **UI Components** (`src/components/ui/`): Reusable widgets using Radix UI primitives + Tailwind CVA variants
  - **Button** - CVA-based variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
  - **Card** - Container with title/content sections using custom theme colors
  - **Modal** - Custom implementation (not Radix-based)
  - **SearchBar**, **Table**, **Badge** - UI primitives
- **Special Context** (`src/components/shift/ShiftManager.jsx`) - Provides `useShift()` hook for Cashier shift management

### HTTP Integration
**Axios Client** (`src/services/axiosClient.js`):
- Auto-adds `Authorization: Bearer {token}` from localStorage for all requests
- Base URL from `VITE_API_URL` environment variable
- Used for all API calls; store token in localStorage after login

## Development Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # TypeScript compilation + Vite production build
npm run lint      # ESLint check (flat config, no type checking enabled)
npm run preview   # Preview production build locally
```

**Build requirement:** `tsc -b && vite build` — TypeScript must compile successfully before Vite bundle is created.

## Critical Conventions

### File Type Consistency
- **JSX files** (`.jsx`) - Pages, layouts, context providers (uses pure JavaScript, no TypeScript)
- **TSX files** (`.tsx`) - UI components in `components/ui/` (uses TypeScript + generics)
- **Utilities** (`src/lib/utils.ts`) - Helper functions using TypeScript

### Theme & Styling
- All colors use **CSS HSL variables** (no Hex/RGB literals in Tailwind)
- Sidebar colors: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-primary`, etc.
- Custom card colors: `bg-card`, `text-card-title`, etc.
- Variables defined in `index.css` (not committed in current view — they're CSS custom properties)
- Tailwind config in `tailwind.config.js` extends theme with HSL color references

### Component Composition Pattern
UI components use **CVA (class-variance-authority)** for variant management:
```tsx
const variants = cva(baseClasses, {
  variants: { variant: { ... }, size: { ... } },
  defaultVariants: { variant: "default", size: "default" }
});
```
Consumers pass `variant` and `size` props to control styling — no inline `className` overrides.

### Context & State Management
- **Shift context** (`useShift()`) in CashierLayout tracks `isShiftOpen` state
- **Page-level state** via `useState()` for filters, modals, current views
- No Redux/Zustand — all state is local to layouts or page components
- localStorage is used for tokens, failed login attempts, and user preferences

### Authentication & Role Routing
- Login check occurs in Login page; on success, stores `token`, `userRole`, `isAuthenticated`, `userEmail` to localStorage
- Router has three paths: `/` (Login), `/admin`, `/employee`, `/cashier`
- Layouts extract role from localStorage and conditionally render menu items
- **No protected route wrapper** — rely on manual checks in layout logout handlers

## Common Development Tasks

### Adding a New Admin Page
1. Create file `src/pages/NewFeature/index.jsx`
2. Build component with Header, Cards, and data state
3. Import into `AdminLayout.jsx` and add menu item:
   ```jsx
   { id: "newfeature", name: "Label", icon: <Icon />, component: NewFeature }
   ```
4. Page automatically renders when menu item clicked

### API Integration
1. Create Axios call in page component or extract to `src/services/` file:
   ```jsx
   const response = await axiosClient.get('/endpoint');
   ```
2. Token auth is automatic (Bearer token from localStorage)
3. Catch errors and setState for UI feedback

### Customizing Button Variants
1. Edit button CVA variants in `src/components/ui/button.tsx`
2. Update `ButtonProps` interface if adding new prop types
3. Use in pages: `<Button variant="destructive" size="lg">Delete</Button>`

### Styling New Components
- Use Tailwind classes: `className="flex items-center gap-2 px-4 py-2"`
- Reference theme colors: `text-sidebar-primary`, `bg-card`, `border border-input`
- No inline styles; all styling via Tailwind utilities and custom HSL variables

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/router/index.jsx](../src/router/index.jsx) | Route definitions (3 layout roots) |
| [src/layouts/AdminLayout.jsx](../src/layouts/AdminLayout.jsx) | Admin menu + page switching |
| [src/layouts/CashierLayout.jsx](../src/layouts/CashierLayout.jsx) | Cashier menu + ShiftProvider wrapper |
| [src/services/axiosClient.js](../src/services/axiosClient.js) | HTTP client with auth interceptor |
| [src/components/ui/button.tsx](../src/components/ui/button.tsx) | Button component with CVA variants |
| [tailwind.config.js](../tailwind.config.js) | Theme config with HSL color extension |
| [.env](../.env) | `VITE_API_URL` for backend connection |

## Debugging Tips

- **HMR not working?** Ensure `npm run dev` is running and check Vite config in `vite.config.ts`
- **Token not sent?** Verify localStorage has `token` key set after login
- **Component not rendering?** Check `currentView` state matches menu item `id` exactly
- **Styling looks broken?** Ensure Tailwind config references correct CSS variable names for HSL colors
- **Build fails?** Run `npm run lint` to check for ESLint errors; `tsc --noEmit` to check TypeScript
