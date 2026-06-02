# oneclub-member-shop

Reusable React components for the 1club member center, profile, and points redemption flow.

## Overview

This package provides ready-to-use UI and logic for:

- Member login and activation
- Member profile display and account updates
- Product listing and redemption with points deduction
- Coupon creation and email delivery integration
- A single-product redemption panel for embedded checkout flows

The package is designed for React 18+ projects and uses React Bootstrap for UI.

## Features

- Cookie-based member session management (`user` cookie)
- Integrated member center layout (`login + profile + market`)
- Product redemption with:
- Cash and discount-point mixed payment
- Max deduction constraints
- Success modal and QR display (for fixed-price/manual-pay products)
- Profile operations:
- Logout
- Update password
- Update phone number

## Installation

Install the package and peer/runtime dependencies in your host app:

```bash
npm install oneclub-member-shop react react-dom react-bootstrap bootstrap js-cookie axios
```

Then import Bootstrap styles once in your app entry:

```js
import "bootstrap/dist/css/bootstrap.min.css";
```

Optional (recommended): import Bootstrap Icons if your app uses the built-in eye/check icons shown by these components.

```bash
npm install bootstrap-icons
```

```js
import "bootstrap-icons/font/bootstrap-icons.css";
```

## Testing in Another Project

To test this package locally in another project, use one of the following methods:

### Method 1: Using npm link (Recommended for Development)

This method creates a symlink, allowing real-time testing with code changes.

**In the 1club-member-shop directory:**

```bash
npm link
```

**In your test project directory:**

```bash
npm link oneclub-member-shop
```

Now any changes you make in `1club-member-shop/src` will be reflected immediately in your test project.

**To unlink when done:**

```bash
# In your test project
npm unlink oneclub-member-shop

# In 1club-member-shop
npm unlink
```

### Method 2: Using Local File Path

Install directly from the local file path (no real-time updates).

**In your test project:**

```bash
npm install file:../1club-member-shop
```

(Adjust the relative path based on your directory structure)

### Method 3: Test with a Sample React App

Create a quick test project to verify the package:

```bash
# Create a new React app
npx create-react-app test-member-shop
cd test-member-shop

# Link the package
npm link ../1club-member-shop

# Install peer dependencies
npm install react-bootstrap bootstrap bootstrap-icons

# Update src/App.js with component examples
```

Then import and test components as shown in the Quick Start section.

## Exports

The package exports from `src/index.js`:

- `MemberCenterLayout`
- `MemberPointMarket`
- `MemberLoginModal`
- `MemberProfileCard`
- `SingleProductRedeemPanel`
- `AlternatingText`
- `SuccessModal`
- `useMemberAuth`

## Quick Start

Use the all-in-one layout component:

```jsx
import React from "react";
import { MemberCenterLayout } from "oneclub-member-shop";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

export default function MemberCenterPage() {
  return (
    <MemberCenterLayout
      cmsEndpoint="https://your-cms.example.com"
      cmsApiKey="YOUR_STRAPI_API_TOKEN"
      couponEndpoint="https://your-coupon-service.example.com"
      emailEndpoint="https://your-email-service.example.com"
      title="Member Center"
      texts={{
        notLoggedIn: "Please sign in to view points and redeem benefits.",
        loginButton: "Member Login",
      }}
    />
  );
}
```

## Component APIs

### MemberCenterLayout

Props:

- `cmsEndpoint: string` (required)
- `cmsApiKey: string` (required)
- `couponEndpoint: string` (required)
- `emailEndpoint: string` (required)
- `title?: string` (default: `会员中心`)
- `texts?: { notLoggedIn?: string; loginButton?: string }`

Behavior:

- If not logged in: shows login CTA and login modal.
- If logged in: shows `MemberProfileCard` and `MemberPointMarket`.

### MemberPointMarket

Props:

- `cmsEndpoint: string` (required)
- `cmsApiKey: string` (required)
- `couponEndpoint: string` (required)
- `emailEndpoint: string` (required)
- `getUser?: () => member`
- `setUser?: (member) => void`

Behavior:

- Loads allowed products from membership record, falls back to all `ForOneClub=True` products.
- Supports fixed amount and regular products.
- Creates coupon, optionally sends email, updates member points and coupon relations.

### MemberLoginModal

Props:

- `show: boolean`
- `onClose: () => void`
- `onLoginSuccess?: (memberInfo) => void`

Environment variables used by this component:

- `VITE_CMS_API_ENDPOINT`
- `VITE_CMS_API_KEY`

Flow:

- `Confirmed` member: set password and activate.
- `Active` member: password login.
- On success, writes `user` cookie and triggers callback.

### MemberProfileCard

Props:

- `member: Member`
- `cmsEndpoint: string`
- `cmsApiKey: string`

Features:

- Displays key member info and balances.
- Supports password update and phone update.
- Handles logout by clearing cookies.

### SingleProductRedeemPanel

Props:

- `cmsEndpoint: string` (required)
- `cmsApiKey: string` (required)
- `couponEndpoint: string` (required)
- `emailEndpoint: string` (required)
- `product: { Name, Price, MaxDeduction, Description?, ProviderName? }` (required)
- `onSuccess?: () => void`

Notes:

- `ProviderName` should match coupon-system provider account name.
- Uses `SuccessModal` after successful redemption.

## Hook API

`useMemberAuth` and helpers from `src/hooks/useMemberAuth.js`:

- `getCurrentMember()`
- `setCurrentMember(member, options?)`
- `isMemberLoggedIn()`
- `useMemberAuth()`

Cookie details:

- Cookie key: `user`
- Default expiry when using `setCurrentMember`: `7` days

## Backend Contract

You should provide compatible endpoints for:

1. CMS (Strapi-like membership/product APIs)
2. Coupon service
3. Email distribution service

Expected calls include:

- `GET /api/one-club-memberships?...`
- `PUT /api/one-club-memberships/:documentId`
- `GET /api/one-club-products?...`
- `POST /api/one-club-memberships/verify-password`
- `POST {couponEndpoint}/create-active-coupon`
- `POST {emailEndpoint}/1club/coupon_distribute`

## Usage Example: Single Product Panel

```jsx
import React from "react";
import { SingleProductRedeemPanel } from "oneclub-member-shop";

export default function ProductCheckout() {
  return (
    <SingleProductRedeemPanel
      cmsEndpoint="https://your-cms.example.com"
      cmsApiKey="YOUR_STRAPI_API_TOKEN"
      couponEndpoint="https://your-coupon-service.example.com"
      emailEndpoint="https://your-email-service.example.com"
      product={{
        Name: "Dining Voucher",
        Price: 120,
        MaxDeduction: 60,
        Description: "Use in selected stores",
        ProviderName: "1Club",
      }}
      onSuccess={() => {
        console.log("Redeem success");
      }}
    />
  );
}
```

## Scripts

Current package scripts:

- `npm run build` -> placeholder (`no build step yet`)
- `npm test` -> placeholder (`no tests`)

## License

MIT
