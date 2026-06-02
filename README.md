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

### Install This Project Locally (for development)

If you are working on this repository directly:

```bash
git clone https://github.com/DreamOverseas/1club-member-shop.git
cd 1club-member-shop
npm install
```

This project is a reusable component package, so there is no built-in dev server in this repo.
To run and preview UI flows, link this package into a host React app and render exported components there.

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

## Testing

### Automated tests

Run:

```bash
npm test
```

Current status:

- The repository does not include an automated test suite yet.
- `npm test` currently prints `no tests` and exits successfully.

### Manual verification checklist

Until automated tests are added, verify in a host app:

1. Login/activation flow works for `Confirmed` and `Active` members.
2. Profile card renders member data and can update password/phone.
3. Market product list loads from CMS and search works.
4. Redemption flow enforces deduction limits and balance checks.
5. Coupon creation + email dispatch endpoints are called successfully.
6. Success modal/QR display behavior matches product type (`Fixed` vs non-fixed).

## License

MIT
